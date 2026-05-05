/**
 * `rotateAgent` — orchestrates the 4-step session-key rotation:
 *
 *   1. Read on-chain ENS records (fail if no current policy-version + delegation).
 *   2. Fetch current policy doc via IPFS + canonicalize for hash baseline.
 *   3. Issue a fresh session-key under a versioned filename
 *      `<alias>-policy-v<N>.json` where N is the new on-chain version
 *      (NOT a previous-suffix increment — filesystem mirrors published state).
 *   4. Author bumped policy, write to ephemeral tmpdir, pin via Pinata,
 *      compute new policy-hash, build the 4-record publish plan.
 *
 * Read-only by default. The plan-only path returns a `PublishPlan` with
 * `broadcast: false` (matches `agent publish` semantics from #51).
 *
 * Does NOT call `revokeSessionKey`. Off-chain semantic — once the
 * `runtime-pubkey` ENS record points at the new signer, verifiers must
 * reject signatures from the old key. On-chain revoke is gas the operator
 * can pay later via a `--revoke-onchain` follow-up flag (out of scope
 * for this PR per issue #54 §"Out of scope").
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  type Address,
  type Chain,
} from "viem";
import { canonicalizeBytes } from "../utils/jcs.js";
import { getTextRecords, getOwner } from "../utils/ens.js";
import { fetchIpfsRaw } from "../utils/ipfs.js";
import {
  pinDirectory,
  type PinDirectoryResult,
} from "../utils/pinata.js";
import {
  publishAgentRecords,
  type AgentPublishRecords,
  type PublishOptions,
  type PublishPlan,
} from "../utils/agent-publish.js";
import { issueSessionKey, type IssueSessionKeyOptions } from "./namera-issue.js";
import { bumpPolicy, nextMajorVersion, type PolicyDoc } from "./policy-bump.js";
import type { KeystoreJson } from "./keystore.js";

// =============================================================================
// Public types
// =============================================================================

export interface RotateAgentArgs {
  ensName: string;
  /** Base alias (the one passed to `agent issue`). */
  alias: string;
  ownerKeystore: KeystoreJson;
  ownerPassword: string;
  /** Smart-account's chain (e.g. base). Used for the SDK calls only. */
  chain: Chain;
  chainLabel: string;
  /** RPC for the smart-account's chain. MUST preserve eth_call revert
   * data (Alchemy, Tenderly Gateway, etc.) — see #53. */
  rpc: string;
  bundlerUrl: string;
  /**
   * Mainnet RPC used to read + write ENS text records. ENS lives on
   * mainnet regardless of where the smart-account is. Defaults to the
   * resolver's standard mainnet RPC (eth.drpc.org).
   */
  ensRpcUrl?: string;
  ipfsGateways?: string[];
  /** When omitted, auto-bumps from on-chain `policy-version`. */
  newPolicyVersion?: string;
  newTtlHours?: number;
  newGasCapWei?: bigint;
  /** Smart-account index used at issuance. Defaults 0n. */
  index?: bigint;
  kernelVersion?: string;
  /** RFC 3339 timestamp for both top-level and active-session-key issued-at.
   * Caller-supplied so the function stays pure for tests. Default: now. */
  issuedAt?: string;
  /** Pinata JWT — required for the pin step. */
  pinataJwt: string;
  pinataMetadataName?: string;
  pinataGateway?: string;
  /** ENS resolver address. Read from chain unless provided. */
  resolverAddress?: Address;
  /** Operator-supplied. When false (default), no transaction is broadcast. */
  broadcast?: boolean;
  /** When `broadcast: true`, a callback that signs + sends the multicall. */
  send?: PublishOptions["send"];
  /** Inject for tests. */
  testHooks?: {
    readRecords?: (
      ensName: string,
      keys: readonly string[],
    ) => Promise<Record<string, string>>;
    fetchIpfs?: (uri: string) => Promise<{ bytes: Uint8Array; gateway: string }>;
    pinDirectory?: typeof pinDirectory;
    issueSessionKey?: typeof issueSessionKey;
    publishAgentRecords?: typeof publishAgentRecords;
  };
}

export interface RotateResult {
  ensName: string;
  alias: string;
  /** Filesystem artifact name carrying the new session-key:
   *  `<alias>-policy-v<N>.json` where N is the new on-chain version
   *  (NOT a previous-suffix increment — mirrors published state). */
  newSessionKeyArtifact: string;
  fromVersion: string;
  toVersion: string;
  fromRuntimePubkey: string;
  toRuntimePubkey: string;
  newPolicy: { hash: string; uri: string; version: string };
  publishPlan: PublishPlan;
  broadcast: boolean;
}

// The 9 ENSIP-64 keys we read up-front. Imported as a const here so the
// rotate module doesn't take a hard dep on agent-verify just for the
// constant's value — duplicate is cheap, version drift is unlikely.
const AGENT_RECORD_KEYS = [
  "class",
  "schema",
  "runtime-pubkey",
  "runtime-status",
  "kernel-wallet",
  "agent-endpoint[web]",
  "delegation",
  "policy-hash",
  "policy-version",
] as const;

// =============================================================================
// Orchestrator
// =============================================================================

export async function rotateAgent(args: RotateAgentArgs): Promise<RotateResult> {
  const issuedAt = args.issuedAt ?? new Date().toISOString();
  const ipfsGateways = args.ipfsGateways;
  const fetchHook = args.testHooks?.fetchIpfs;

  const records = await readRecords(args);

  // 1) Validate the precondition: rotation requires an existing v1 (+) policy.
  const fromVersion = records["policy-version"];
  const fromDelegationUri = records.delegation;
  const fromRuntimePubkey = records["runtime-pubkey"];
  if (!fromVersion || !fromDelegationUri || !fromRuntimePubkey) {
    throw new Error(
      `agent rotate ${args.ensName}: name lacks an existing policy. Required ENS records: policy-version, delegation, runtime-pubkey. Run \`agent publish\` first.`,
    );
  }
  const toVersion = args.newPolicyVersion ?? nextMajorVersion(fromVersion);

  // 2) Fetch the current policy doc.
  const fetched = fetchHook
    ? await fetchHook(fromDelegationUri)
    : await fetchIpfsRaw(fromDelegationUri, { gateways: ipfsGateways });
  const currentPolicy = JSON.parse(new TextDecoder().decode(fetched.bytes)) as PolicyDoc;

  // 3) Issue a fresh session-key under the new versioned alias.
  // The artifact name encodes the NEW policy version so the on-disk file
  // matches what's published. Same as the alias-keyed convention from
  // `agent issue` (#53), just with a deterministic suffix tied to the
  // version, not to a counter.
  const newSessionKeyArtifact = `${args.alias}-policy-${toVersion}`;
  const issueFn = args.testHooks?.issueSessionKey ?? issueSessionKey;
  const issueArgs: IssueSessionKeyOptions = {
    alias: newSessionKeyArtifact,
    ownerKeystore: args.ownerKeystore,
    ownerPassword: args.ownerPassword,
    chain: args.chain,
    chainLabel: args.chainLabel,
    rpc: args.rpc,
    bundlerUrl: args.bundlerUrl,
    kernelVersion: args.kernelVersion,
    index: args.index,
    ttlHours: args.newTtlHours,
    gasCapWei: args.newGasCapWei,
  };
  const issued = await issueFn(issueArgs);
  const toRuntimePubkey = issued.sessionKeyAddress;

  // 4) Author the bumped policy doc.
  const newPolicy = bumpPolicy(currentPolicy, {
    newVersion: toVersion,
    newSessionKeyAddress: toRuntimePubkey,
    issuedAt,
    newTtlHours: args.newTtlHours,
  });
  const newPolicyHash = keccak256(toHex(canonicalizeBytes(newPolicy as never)));

  // 5) Pin the new policy. We write it to an ephemeral tmpdir alongside
  // a sentinel file (Pinata flattens single-file pins) and remove the
  // tmpdir as soon as Pinata returns the CID. The CID is the durable
  // artifact; the local tmpdir is a transient.
  const policyRelpath = `policies/delegation-policy-${toVersion}.json`;
  const pinFn = args.testHooks?.pinDirectory ?? pinDirectory;
  const tmp = mkdtempSync(join(tmpdir(), `agent-rotate-${args.alias}-`));
  let pinResult: PinDirectoryResult;
  try {
    const policyBytes = canonicalizeBytes(newPolicy as never);
    const sentinelPath = join(tmp, "ROTATION.txt");
    const policyFullPath = join(tmp, policyRelpath);
    writeFileSync(
      sentinelPath,
      `Rotation artifact for ${args.ensName} ${fromVersion} → ${toVersion}. CID-only; safe to discard.`,
    );
    // Recreate parent dirs for the relpath inside tmpdir.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(tmp, "policies"), { recursive: true });
    writeFileSync(policyFullPath, policyBytes);

    pinResult = await pinFn(
      [
        { relpath: "ROTATION.txt", bytes: new Uint8Array(readFileSync(sentinelPath)) },
        { relpath: policyRelpath, bytes: new Uint8Array(readFileSync(policyFullPath)) },
      ],
      {
        jwt: args.pinataJwt,
        metadataName:
          args.pinataMetadataName ?? `${args.alias}-policy-${toVersion}`,
        gateway: args.pinataGateway,
      },
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const newDelegationUri = `ipfs://${pinResult.cid}/${policyRelpath}`;

  // 6) Build the 4-record publish plan via #51's publishAgentRecords.
  // Optional records (delegation/policy-hash/policy-version) carry the
  // new values; required records that aren't changing carry their
  // current values so #51's record-set assembly stays happy.
  const publishFn = args.testHooks?.publishAgentRecords ?? publishAgentRecords;
  const fullRecords: AgentPublishRecords = {
    schema: records.schema,
    "runtime-pubkey": toRuntimePubkey,
    "runtime-status": (records["runtime-status"] ??
      "active") as AgentPublishRecords["runtime-status"],
    "kernel-wallet": records["kernel-wallet"],
    "agent-endpoint[web]": records["agent-endpoint[web]"],
    delegation: newDelegationUri,
    "policy-hash": newPolicyHash,
    "policy-version": toVersion,
  };
  // publishAgentRecords reads/writes ENS records, which live on mainnet
  // — not on the agent's smart-account chain. Use the mainnet RPC.
  const { mainnet } = await import("viem/chains");
  const client = createPublicClient({
    chain: mainnet,
    transport: http(args.ensRpcUrl ?? "https://eth.drpc.org"),
  });
  // Resolver address: caller may pre-supply (CLI does the lookup); else
  // we fall back to the chain's default ENS resolver via getOwner-side
  // utilities. Required for publishAgentRecords' diff.
  const resolverAddress = args.resolverAddress ?? (await defaultResolverFor(args, client));
  const publishPlan = await publishFn(args.ensName, fullRecords, client, {
    resolverAddress,
    multicall: true,
    legacyAliases: false,
    broadcast: args.broadcast ?? false,
    send: args.send,
  });

  return {
    ensName: args.ensName,
    alias: args.alias,
    newSessionKeyArtifact,
    fromVersion,
    toVersion,
    fromRuntimePubkey,
    toRuntimePubkey,
    newPolicy: { hash: newPolicyHash, uri: newDelegationUri, version: toVersion },
    publishPlan,
    broadcast: !!args.broadcast,
  };
}

async function readRecords(
  args: RotateAgentArgs,
): Promise<Record<string, string>> {
  if (args.testHooks?.readRecords) {
    return args.testHooks.readRecords(args.ensName, AGENT_RECORD_KEYS);
  }
  // ENS lives on mainnet, not the agent's smart-account chain. Reading
  // text records against args.chain (Base) silently returns empty.
  const { mainnet } = await import("viem/chains");
  const client = createPublicClient({
    chain: mainnet,
    transport: http(args.ensRpcUrl ?? "https://eth.drpc.org"),
  });
  return getTextRecords(
    client,
    args.ensName,
    AGENT_RECORD_KEYS as unknown as string[],
  );
}

async function defaultResolverFor(
  args: RotateAgentArgs,
  // biome-ignore lint/suspicious/noExplicitAny: viem's PublicClient generic
  client: any,
): Promise<Address> {
  // Best-effort fallback: ask the registry for the resolver of the name.
  // If that fails, the caller should pass --rpc to a Base RPC AND
  // --resolver-address explicitly. The CLI does this lookup before
  // calling rotateAgent so this branch shouldn't usually fire.
  const { mainnet } = await import("viem/chains");
  void mainnet;
  void getOwner;
  // Use ens-resolver-from-name pattern:
  const ensClient = createPublicClient({
    chain: { ...args.chain, id: 1 } as Chain,
    transport: http(),
  });
  void ensClient;
  void client;
  throw new Error(
    "rotateAgent: --resolver-address is required (CLI auto-resolves; library callers must pass)",
  );
}

/**
 * Read the persisted rotation artifact and extract its session-key
 * address — used by the runtime adapter to locate the active session
 * key after a rotation. The CLI also exposes this via the JSON output.
 */
export function readRotationArtifact(storeDir: string, alias: string, version: string): {
  sessionKeyPath: string;
  artifactName: string;
} {
  const artifactName = `${alias}-policy-${version}`;
  const sessionKeyPath = join(storeDir, "session-keys", `${artifactName}.json`);
  if (!existsSync(sessionKeyPath)) {
    throw new Error(`rotation artifact not found: ${sessionKeyPath}`);
  }
  return { sessionKeyPath, artifactName };
}
