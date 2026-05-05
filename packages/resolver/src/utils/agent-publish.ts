/**
 * Agent record publishing — broadcasts the 9 ENSIP-64 records onto an ENS name.
 *
 * Read+write: this module signs and broadcasts transactions when
 * `dryRun: false` is passed. The CLI's default is `dryRun: true` (the
 * `--broadcast` flag is the only opt-in to mutation), so a stray
 * invocation can't accidentally mutate mainnet.
 *
 * Validation: every record value is checked against the same regex set
 * the records-layer in `agent verify` uses. Single source of truth for
 * what a "valid" agent record looks like.
 */

import {
  encodeFunctionData,
  namehash,
  type Address,
  type PublicClient,
} from "viem";
import { normalize } from "viem/ens";
import { AGENT_RECORD_KEYS, type AgentRecordKey } from "../layers/agent-verify.js";

// =============================================================================
// Validation — single source of truth, shared with the verifier
// =============================================================================

const HEX_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const URI_RE = /^(ipfs:\/\/|https:\/\/|cbor:).+/;
const HTTPS_RE = /^https?:\/\/.+/;
const VERSION_RE = /^v[0-9]+(\.[0-9]+){0,2}$/;
const STATUS_VALUES = new Set(["active", "paused", "revoked"]);

export interface ValidationIssue {
  key: AgentRecordKey;
  reason: string;
}

/**
 * Same per-key validation the records-layer in `agent verify` runs.
 * Returns one issue per offending key (not first-error-wins) so the
 * operator sees every problem in one round-trip.
 */
export function validateAgentRecords(
  records: Partial<Record<AgentRecordKey, string>>,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  // `class` is optional here — buildRecordList defaults it to "Agent" so
  // operators don't have to pass --class explicitly. Validation only
  // complains if class IS supplied with a non-"Agent" value.
  const required: AgentRecordKey[] = [
    "schema",
    "runtime-pubkey",
    "runtime-status",
    "kernel-wallet",
    "agent-endpoint[web]",
  ];
  for (const key of required) {
    if (!records[key]) out.push({ key, reason: "missing required record" });
  }
  for (const key of AGENT_RECORD_KEYS) {
    const v = records[key];
    if (v === undefined || v === "") continue;
    const reason = perKeyReason(key, v);
    if (reason) out.push({ key, reason });
  }
  return out;
}

function perKeyReason(key: AgentRecordKey, value: string): string | null {
  switch (key) {
    case "class":
      return value === "Agent" ? null : `expected "Agent"`;
    case "schema":
    case "delegation":
      return URI_RE.test(value) ? null : `must start with ipfs://, https://, or cbor:`;
    case "runtime-pubkey":
    case "kernel-wallet":
      return HEX_ADDR_RE.test(value) ? null : `not a 0x-prefixed 20-byte address`;
    case "runtime-status":
      return STATUS_VALUES.has(value) ? null : `expected one of active|paused|revoked`;
    case "agent-endpoint[web]":
      return HTTPS_RE.test(value) ? null : `not an http(s) URL`;
    case "policy-hash":
      return HEX_HASH_RE.test(value) ? null : `not a 0x-prefixed 32-byte hex string`;
    case "policy-version":
      return VERSION_RE.test(value) ? null : `expected v<N>[.<M>[.<P>]]`;
    default:
      return null;
  }
}

// =============================================================================
// Records assembly
// =============================================================================

export interface AgentPublishRecords {
  class?: string;
  schema: string;
  "runtime-pubkey": string;
  "runtime-status": "active" | "paused" | "revoked";
  "kernel-wallet": string;
  "agent-endpoint[web]": string;
  delegation?: string;
  "policy-hash"?: string;
  "policy-version"?: string;
}

/**
 * Build the ordered list of (key, value) pairs to write. Optional records
 * (delegation / policy-hash / policy-version) are skipped when not
 * provided — matches `publish-records.sh:82-84` `[[ -n ... ]]` behavior.
 *
 * `legacyAliases: true` appends 7 deprecated `agent.<name>_v1` keys for
 * one transition window. Names match the bash exactly:
 *   agent.runtime_pubkey_v1, agent.runtime_status_v1, agent.kernel_wallet_v1,
 *   agent.session_signer_v1 (alias to runtime-pubkey), agent.policy_hash_v1,
 *   agent.policy_version_v1, agent.delegation_v1.
 */
export function buildRecordList(
  records: AgentPublishRecords,
  options: { legacyAliases?: boolean } = {},
): { key: string; value: string }[] {
  const cls = records.class ?? "Agent";
  const out: { key: string; value: string }[] = [
    { key: "class", value: cls },
    { key: "schema", value: records.schema },
    { key: "runtime-pubkey", value: records["runtime-pubkey"] },
    { key: "runtime-status", value: records["runtime-status"] },
    { key: "kernel-wallet", value: records["kernel-wallet"] },
    { key: "agent-endpoint[web]", value: records["agent-endpoint[web]"] },
  ];
  if (records.delegation) out.push({ key: "delegation", value: records.delegation });
  if (records["policy-hash"]) out.push({ key: "policy-hash", value: records["policy-hash"] });
  if (records["policy-version"])
    out.push({ key: "policy-version", value: records["policy-version"] });

  if (options.legacyAliases) {
    out.push(
      { key: "agent.runtime_pubkey_v1", value: records["runtime-pubkey"] },
      { key: "agent.runtime_status_v1", value: records["runtime-status"] },
      { key: "agent.kernel_wallet_v1", value: records["kernel-wallet"] },
      { key: "agent.session_signer_v1", value: records["runtime-pubkey"] },
    );
    if (records["policy-hash"])
      out.push({ key: "agent.policy_hash_v1", value: records["policy-hash"] });
    if (records["policy-version"])
      out.push({ key: "agent.policy_version_v1", value: records["policy-version"] });
    if (records.delegation)
      out.push({ key: "agent.delegation_v1", value: records.delegation });
  }
  return out;
}

// =============================================================================
// Calldata encoding
// =============================================================================

const RESOLVER_ABI = [
  {
    name: "setText",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "multicall",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "string" }],
  },
] as const;

/**
 * Encode each record as a `setText(node, key, value)` calldata blob.
 * Used both for per-tx mode (one blob per transaction) and for multicall
 * mode (concatenated into the multicall arg array).
 */
export function encodeSetTextCalls(
  ensName: string,
  records: { key: string; value: string }[],
): `0x${string}`[] {
  const node = namehash(normalize(ensName));
  return records.map((r) =>
    encodeFunctionData({
      abi: RESOLVER_ABI,
      functionName: "setText",
      args: [node, r.key, r.value],
    }),
  );
}

/**
 * Encode the entire records list as a single `multicall(bytes[])`.
 * One transaction, one signature, atomic — replaces the bash's 9
 * sequential setText transactions.
 */
export function encodeMulticall(setTextCalls: `0x${string}`[]): `0x${string}` {
  return encodeFunctionData({
    abi: RESOLVER_ABI,
    functionName: "multicall",
    args: [setTextCalls],
  });
}

// =============================================================================
// Diff against current on-chain values
// =============================================================================

export interface RecordDiff {
  key: string;
  current: string | null;
  next: string;
  changed: boolean;
}

/**
 * Read the current on-chain value for each record so the dry-run
 * presenter can show "old → new" per key. Public read; never broadcasts.
 */
export async function diffAgainstChain(
  client: PublicClient,
  resolverAddress: Address,
  ensName: string,
  records: { key: string; value: string }[],
): Promise<RecordDiff[]> {
  const node = namehash(normalize(ensName));
  return Promise.all(
    records.map(async (r) => {
      let current: string | null = null;
      try {
        const v = (await client.readContract({
          address: resolverAddress,
          abi: RESOLVER_ABI,
          functionName: "text",
          args: [node, r.key],
        })) as string;
        current = v ?? null;
      } catch {
        current = null;
      }
      return { key: r.key, current, next: r.value, changed: (current ?? "") !== r.value };
    }),
  );
}

// =============================================================================
// Public publish entry point
// =============================================================================

export interface PublishOptions {
  resolverAddress: Address;
  multicall?: boolean;
  legacyAliases?: boolean;
  /**
   * Send transactions when true. Default false — the caller must
   * explicitly opt in to mutate state.
   */
  broadcast?: boolean;
  /**
   * Send the transaction(s) and wait for receipt(s). Caller-supplied so
   * the resolver package doesn't take a viem-wallet dep — the CLI passes
   * its existing setText helper.
   */
  send?: (calldata: `0x${string}`, target: Address) => Promise<`0x${string}`>;
}

export interface PublishPlan {
  ensName: string;
  resolver: Address;
  records: { key: string; value: string }[];
  diffs: RecordDiff[] | null;
  setTextCalls: `0x${string}`[];
  multicallCalldata?: `0x${string}`;
  txHashes?: `0x${string}`[];
  broadcast: boolean;
}

/**
 * Validate, diff, encode, and (optionally) broadcast.
 *
 * The function is kept transport-agnostic: it doesn't construct wallet
 * clients or read env vars. The caller (CLI) injects a `send` callback
 * that returns a tx hash. This keeps the resolver package free of CLI
 * deps (Ledger, dotenv, etc.) while still letting tests exercise the
 * broadcast path with a stub.
 */
export async function publishAgentRecords(
  ensName: string,
  records: AgentPublishRecords,
  client: PublicClient,
  options: PublishOptions,
): Promise<PublishPlan> {
  const issues = validateAgentRecords(records);
  if (issues.length > 0) {
    throw new Error(
      `agent publish: ${issues.length} validation error(s):\n` +
        issues.map((i) => `  ${i.key}: ${i.reason}`).join("\n"),
    );
  }

  const useMulticall = options.multicall !== false; // default true
  const recordList = buildRecordList(records, { legacyAliases: options.legacyAliases });
  const setTextCalls = encodeSetTextCalls(ensName, recordList);
  const multicallCalldata = useMulticall ? encodeMulticall(setTextCalls) : undefined;
  const diffs = await diffAgainstChain(client, options.resolverAddress, ensName, recordList);

  const plan: PublishPlan = {
    ensName,
    resolver: options.resolverAddress,
    records: recordList,
    diffs,
    setTextCalls,
    multicallCalldata,
    broadcast: !!options.broadcast,
  };

  if (!options.broadcast) return plan;

  if (!options.send) {
    throw new Error("publishAgentRecords: --broadcast requires a `send` callback");
  }

  const txHashes: `0x${string}`[] = [];
  if (useMulticall) {
    const hash = await options.send(multicallCalldata!, options.resolverAddress);
    txHashes.push(hash);
  } else {
    for (const call of setTextCalls) {
      const hash = await options.send(call, options.resolverAddress);
      txHashes.push(hash);
    }
  }
  plan.txHashes = txHashes;
  return plan;
}
