/**
 * Agent identity verification — TRL extension for ENSIP-64 agent records.
 *
 * Reads 9 ENSIP-64 text records from an ENS name, fetches the agent + policy
 * schemas + the policy doc itself from IPFS, then runs five layered checks
 * (records, schema, integrity, binding, liveness) and an optional sixth
 * (signature, via the operator's `/sign` HTTP endpoint).
 *
 * Read-only: never writes records or pins to IPFS.
 */

import { keccak256, toHex, recoverMessageAddress, type Address } from "viem";
import {
  createEnsClient,
  getTextRecords,
  getOwner,
} from "../utils/ens.js";
import { fetchIpfsRaw } from "../utils/ipfs.js";

interface FetchedDocument {
  bytes: Uint8Array;
  gateway: string;
}

/**
 * Fetch a `schema` / `delegation` document by URI scheme. The records-layer
 * regex accepts `ipfs://`, `https://`, and `cbor:` URIs to match the agent
 * schema spec — so we must support fetching all three (or surface an explicit
 * error). `cbor:` is reserved for a future binary-encoded variant and is not
 * yet implemented; we reject it with a clear message rather than letting
 * downstream JSON.parse fail.
 */
async function fetchByScheme(
  uri: string,
  options: { gateways?: string[]; timeoutMs: number; fetch: typeof fetch },
  testHooks?: AgentVerifyOptions["testHooks"],
): Promise<FetchedDocument> {
  if (uri.startsWith("ipfs://")) {
    if (testHooks?.fetchIpfs) return testHooks.fetchIpfs(uri);
    return fetchIpfsRaw(uri, { gateways: options.gateways, timeoutMs: options.timeoutMs });
  }
  if (uri.startsWith("https://")) {
    // https URIs go through the injected fetch directly — testHooks.fetchIpfs
    // is intentionally only consulted for ipfs:// URIs so https schemes
    // flow through real fetch logic during tests.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await options.fetch(uri, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`${uri} → HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return { bytes: new Uint8Array(buffer), gateway: new URL(uri).origin };
    } finally {
      clearTimeout(timer);
    }
  }
  if (uri.startsWith("cbor:")) {
    throw new Error(
      `cbor: URI scheme not yet supported in agent verify v0.1 (only ipfs:// and https://). URI: ${uri}`,
    );
  }
  throw new Error(`Unsupported URI scheme: ${uri}`);
}
import { canonicalizeBytes } from "../utils/jcs.js";
import {
  validate as validateSchema,
  type ValidationError,
} from "../utils/agent-schema-validator.js";

// =============================================================================
// Public types
// =============================================================================

export const AGENT_RECORD_KEYS = [
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

export type AgentRecordKey = (typeof AGENT_RECORD_KEYS)[number];

/** Stable error codes per layer. Surfaced in `--format json` output for
 * downstream consumers (the synthesis explorer route etc.) so they can
 * render layer-specific UI without string-matching prose messages. */
export enum AgentVerifyErrorCode {
  // records
  RECORDS_MISSING = "RECORDS_MISSING",
  RECORDS_MALFORMED = "RECORDS_MALFORMED",
  // schema
  SCHEMA_FETCH_FAILED = "SCHEMA_FETCH_FAILED",
  SCHEMA_VALIDATION_FAILED = "SCHEMA_VALIDATION_FAILED",
  // integrity
  POLICY_FETCH_FAILED = "POLICY_FETCH_FAILED",
  INTEGRITY_HASH_MISMATCH = "INTEGRITY_HASH_MISMATCH",
  // binding
  BINDING_SESSION_KEY_MISMATCH = "BINDING_SESSION_KEY_MISMATCH",
  BINDING_KERNEL_MISMATCH = "BINDING_KERNEL_MISMATCH",
  BINDING_AGENT_MISMATCH = "BINDING_AGENT_MISMATCH",
  // liveness
  LIVENESS_HTTP_FAILED = "LIVENESS_HTTP_FAILED",
  LIVENESS_BAD_RESPONSE = "LIVENESS_BAD_RESPONSE",
  // signature (probe-sign)
  SIGNATURE_PROBE_FAILED = "SIGNATURE_PROBE_FAILED",
  SIGNATURE_RECOVER_MISMATCH = "SIGNATURE_RECOVER_MISMATCH",
}

export interface AgentVerifyOptions {
  ensRpcUrl?: string;
  ipfsGateways?: string[];
  timeoutMs?: number;
  probeSign?: boolean;
  /** Inject a fetch impl for tests. Default: globalThis.fetch. */
  fetch?: typeof fetch;
  /**
   * Inject record-resolution + IPFS fetch + owner lookup for tests. When
   * provided, no network calls are made for ENS or IPFS. The HTTP probes
   * (liveness, probe-sign) still go through `options.fetch`.
   */
  testHooks?: {
    readRecords: (
      ensName: string,
      keys: readonly string[],
    ) => Promise<Record<string, string>>;
    /** Only consulted for `ipfs://` URIs. `https://` URIs flow through
     * `options.fetch`, and `cbor:` is rejected unconditionally. */
    fetchIpfs?: (uri: string) => Promise<{ bytes: Uint8Array; gateway: string }>;
    getOwner?: (ensName: string) => Promise<Address | null>;
  };
}

export interface IdentityCard {
  ensName: string;
  agentId: string | null;
  registryChain: string | null;
  registryAddress: string | null;
  ownerAddress: string | null;
  kernelWallet: string | null;
  runtimePubkey: string | null;
  endpointWeb: string | null;
}

export interface LayerResultRecords {
  passed: boolean;
  missing: AgentRecordKey[];
  malformed: { key: AgentRecordKey; reason: string }[];
  errorCode?: AgentVerifyErrorCode;
}
export interface LayerResultSchema {
  passed: boolean;
  schemaUri: string | null;
  errors: ValidationError[];
  errorCode?: AgentVerifyErrorCode;
}
export interface LayerResultIntegrity {
  passed: boolean;
  expected: string | null;
  computed: string | null;
  policyGateway: string | null;
  errorCode?: AgentVerifyErrorCode;
}
export interface LayerResultBinding {
  passed: boolean;
  details: string[];
  errorCode?: AgentVerifyErrorCode;
}
export interface LayerResultLiveness {
  passed: boolean;
  responseStatus: number | null;
  errorCode?: AgentVerifyErrorCode;
}
export interface LayerResultSignature {
  passed: boolean | null;
  skipped: boolean;
  challenge?: { nonce: string; issuedAt: string; verifierId: string };
  recovered?: string;
  errorCode?: AgentVerifyErrorCode;
}

export interface AgentVerifyResult {
  ensName: string;
  verified: boolean;
  identityCard: IdentityCard;
  layers: {
    records: LayerResultRecords;
    schema: LayerResultSchema;
    integrity: LayerResultIntegrity;
    binding: LayerResultBinding;
    liveness: LayerResultLiveness;
    signature: LayerResultSignature;
  };
  policy: {
    uri: string | null;
    version: string | null;
    scope: string[] | null;
    permittedClasses: string[] | null;
    prohibited: string[] | null;
  };
  warnings: string[];
  errors: string[];
}

// =============================================================================
// Helpers
// =============================================================================

const HEX_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const URI_RE = /^(ipfs:\/\/|https:\/\/|cbor:).+/;

function malformedReason(key: AgentRecordKey, value: string): string | null {
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
      return ["active", "paused", "revoked"].includes(value)
        ? null
        : `expected one of active|paused|revoked`;
    case "agent-endpoint[web]":
      return /^https?:\/\//.test(value) ? null : `not an http(s) URL`;
    case "policy-hash":
      return HEX_HASH_RE.test(value) ? null : `not a 0x-prefixed 32-byte hex string`;
    case "policy-version":
      return /^v[0-9]+(\.[0-9]+){0,2}$/.test(value) ? null : `expected v<N>[.<M>[.<P>]]`;
    default:
      return null;
  }
}

interface PolicyDoc {
  agent?: { "ens-name"?: string; "kernel-wallet"?: string };
  version?: string;
  "active-session-key"?: { address?: string; "kernel-wallet"?: string };
  "delegation-policy"?: {
    scope?: string[];
    "permitted-message-classes"?: string[];
    prohibited?: string[];
  };
}

function emptyResult(ensName: string): AgentVerifyResult {
  return {
    ensName,
    verified: false,
    identityCard: {
      ensName,
      agentId: null,
      registryChain: null,
      registryAddress: null,
      ownerAddress: null,
      kernelWallet: null,
      runtimePubkey: null,
      endpointWeb: null,
    },
    layers: {
      records: { passed: false, missing: [], malformed: [] },
      schema: { passed: false, schemaUri: null, errors: [] },
      integrity: { passed: false, expected: null, computed: null, policyGateway: null },
      binding: { passed: false, details: [] },
      liveness: { passed: false, responseStatus: null },
      signature: { passed: null, skipped: true },
    },
    policy: {
      uri: null,
      version: null,
      scope: null,
      permittedClasses: null,
      prohibited: null,
    },
    warnings: [],
    errors: [],
  };
}

function generateChallenge(): { nonce: string; issuedAt: string; verifierId: string } {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return {
    nonce,
    issuedAt: new Date().toISOString(),
    verifierId: "ensemble-cli/agent-verify@v1",
  };
}

// =============================================================================
// Main
// =============================================================================

export async function verifyAgentIdentity(
  ensName: string,
  options: AgentVerifyOptions = {},
): Promise<AgentVerifyResult> {
  const result = emptyResult(ensName);
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 10_000;

  // -------------------------------------------------------------------------
  // Step 0: read records (off-chain via tests, otherwise live ENS)
  // -------------------------------------------------------------------------
  let records: Record<string, string>;
  let owner: Address | null = null;
  if (options.testHooks) {
    records = await options.testHooks.readRecords(ensName, AGENT_RECORD_KEYS);
    owner = options.testHooks.getOwner ? await options.testHooks.getOwner(ensName) : null;
  } else {
    const client = createEnsClient(options.ensRpcUrl);
    records = await getTextRecords(client, ensName, AGENT_RECORD_KEYS as unknown as string[]);
    owner = await getOwner(client, ensName);
  }

  // Identity Card from records (best-effort even if records layer fails)
  result.identityCard.ownerAddress = owner ?? null;
  result.identityCard.kernelWallet = records["kernel-wallet"] ?? null;
  result.identityCard.runtimePubkey = records["runtime-pubkey"] ?? null;
  result.identityCard.endpointWeb = records["agent-endpoint[web]"] ?? null;

  // -------------------------------------------------------------------------
  // Layer 1: records
  // -------------------------------------------------------------------------
  const missing: AgentRecordKey[] = [];
  const malformed: { key: AgentRecordKey; reason: string }[] = [];
  for (const key of AGENT_RECORD_KEYS) {
    const v = records[key];
    if (v === undefined || v === null || v === "") {
      missing.push(key);
      continue;
    }
    const reason = malformedReason(key, v);
    if (reason) malformed.push({ key, reason });
  }
  result.layers.records.missing = missing;
  result.layers.records.malformed = malformed;
  result.layers.records.passed = missing.length === 0 && malformed.length === 0;
  if (missing.length > 0) {
    result.layers.records.errorCode = AgentVerifyErrorCode.RECORDS_MISSING;
  } else if (malformed.length > 0) {
    result.layers.records.errorCode = AgentVerifyErrorCode.RECORDS_MALFORMED;
  }

  if (!result.layers.records.passed) {
    // Downstream layers cannot run meaningfully — return early with an
    // explicit aggregated result.
    return result;
  }

  // -------------------------------------------------------------------------
  // Layer 2: schema (fetch agent schema, validate `records` against it)
  // -------------------------------------------------------------------------
  const schemaUri = records.schema;
  result.layers.schema.schemaUri = schemaUri;
  result.policy.uri = records.delegation;
  result.policy.version = records["policy-version"];

  let agentSchema: Record<string, unknown> | null = null;
  try {
    const fetched = await fetchByScheme(
      schemaUri,
      { gateways: options.ipfsGateways, timeoutMs, fetch: fetchImpl },
      options.testHooks,
    );
    agentSchema = JSON.parse(new TextDecoder().decode(fetched.bytes));
  } catch (err) {
    result.layers.schema.passed = false;
    result.layers.schema.errorCode = AgentVerifyErrorCode.SCHEMA_FETCH_FAILED;
    result.errors.push(`schema fetch failed: ${(err as Error).message}`);
  }

  if (agentSchema) {
    // Validate the records-as-doc shape: build the implicit object the schema
    // describes from the live ENS records, then validate.
    const recordObj: Record<string, unknown> = {};
    for (const key of AGENT_RECORD_KEYS) recordObj[key] = records[key];
    const sv = validateSchema(recordObj, agentSchema);
    result.layers.schema.passed = sv.valid;
    result.layers.schema.errors = sv.errors;
    if (!sv.valid) {
      result.layers.schema.errorCode = AgentVerifyErrorCode.SCHEMA_VALIDATION_FAILED;
    }
  }

  // -------------------------------------------------------------------------
  // Layer 3: integrity (keccak256(JCS(policy)) == policy-hash)
  // -------------------------------------------------------------------------
  let policyDoc: PolicyDoc | null = null;
  try {
    const fetched = await fetchByScheme(
      records.delegation,
      { gateways: options.ipfsGateways, timeoutMs, fetch: fetchImpl },
      options.testHooks,
    );
    policyDoc = JSON.parse(new TextDecoder().decode(fetched.bytes));
    result.layers.integrity.policyGateway = fetched.gateway;
  } catch (err) {
    result.layers.integrity.passed = false;
    result.layers.integrity.errorCode = AgentVerifyErrorCode.POLICY_FETCH_FAILED;
    result.errors.push(`policy fetch failed: ${(err as Error).message}`);
  }

  if (policyDoc) {
    const computed = keccak256(toHex(canonicalizeBytes(policyDoc as never)));
    result.layers.integrity.expected = records["policy-hash"];
    result.layers.integrity.computed = computed;
    result.layers.integrity.passed = computed.toLowerCase() === records["policy-hash"].toLowerCase();
    if (!result.layers.integrity.passed) {
      result.layers.integrity.errorCode = AgentVerifyErrorCode.INTEGRITY_HASH_MISMATCH;
    }

    // Capture policy summary for output even if hash mismatches.
    result.policy.scope = policyDoc["delegation-policy"]?.scope ?? null;
    result.policy.permittedClasses =
      policyDoc["delegation-policy"]?.["permitted-message-classes"] ?? null;
    result.policy.prohibited = policyDoc["delegation-policy"]?.prohibited ?? null;
  }

  // -------------------------------------------------------------------------
  // Layer 4: binding (policy.active-session-key == runtime-pubkey, etc.)
  // -------------------------------------------------------------------------
  if (policyDoc) {
    const details: string[] = [];
    let bindingPassed = true;
    let bindingErrCode: AgentVerifyErrorCode | undefined;

    const sessionAddr = policyDoc["active-session-key"]?.address;
    if (sessionAddr && sessionAddr.toLowerCase() === records["runtime-pubkey"].toLowerCase()) {
      details.push("active-session-key.address matches runtime-pubkey");
    } else {
      bindingPassed = false;
      bindingErrCode ??= AgentVerifyErrorCode.BINDING_SESSION_KEY_MISMATCH;
      details.push(
        `active-session-key.address (${sessionAddr ?? "missing"}) != runtime-pubkey (${records["runtime-pubkey"]})`,
      );
    }

    const sessionKernel = policyDoc["active-session-key"]?.["kernel-wallet"];
    const agentKernel = policyDoc.agent?.["kernel-wallet"];
    if (
      sessionKernel?.toLowerCase() === records["kernel-wallet"].toLowerCase() &&
      agentKernel?.toLowerCase() === records["kernel-wallet"].toLowerCase()
    ) {
      details.push("kernel-wallet matches across record + policy.agent + policy.active-session-key");
    } else {
      bindingPassed = false;
      bindingErrCode ??= AgentVerifyErrorCode.BINDING_KERNEL_MISMATCH;
      details.push(
        `kernel-wallet mismatch: record=${records["kernel-wallet"]}, policy.agent=${agentKernel ?? "missing"}, policy.session=${sessionKernel ?? "missing"}`,
      );
    }

    const policyEns = policyDoc.agent?.["ens-name"];
    if (policyEns && policyEns.toLowerCase() === ensName.toLowerCase()) {
      details.push(`policy.agent.ens-name matches ${ensName}`);
    } else {
      bindingPassed = false;
      bindingErrCode ??= AgentVerifyErrorCode.BINDING_AGENT_MISMATCH;
      details.push(`policy.agent.ens-name (${policyEns ?? "missing"}) != ${ensName}`);
    }

    result.layers.binding.passed = bindingPassed;
    result.layers.binding.details = details;
    if (!bindingPassed) result.layers.binding.errorCode = bindingErrCode;
  } else {
    result.layers.binding.passed = false;
    result.layers.binding.details = ["skipped — no policy doc"];
  }

  // -------------------------------------------------------------------------
  // Layer 5: liveness — GET <agent-endpoint[web]>/health
  // -------------------------------------------------------------------------
  const healthUrl = records["agent-endpoint[web]"].replace(/\/$/, "") + "/health";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let healthRes: Response;
    try {
      healthRes = await fetchImpl(healthUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    result.layers.liveness.responseStatus = healthRes.status;
    if (!healthRes.ok) {
      result.layers.liveness.passed = false;
      result.layers.liveness.errorCode = AgentVerifyErrorCode.LIVENESS_HTTP_FAILED;
    } else {
      // Best-effort assertion: response should mention the ENS name OR include
      // an `agent` field. We don't fail hard if neither is present — record a
      // warning and pass on HTTP 200.
      let bodyText = "";
      try {
        bodyText = await healthRes.text();
      } catch {
        bodyText = "";
      }
      result.layers.liveness.passed = true;
      if (bodyText && !bodyText.includes(ensName)) {
        result.warnings.push(
          `liveness: /health response did not echo "${ensName}" — only HTTP 200 was asserted`,
        );
      }
    }
  } catch (err) {
    result.layers.liveness.passed = false;
    result.layers.liveness.errorCode = AgentVerifyErrorCode.LIVENESS_HTTP_FAILED;
    result.errors.push(`liveness probe failed: ${(err as Error).message}`);
  }

  // -------------------------------------------------------------------------
  // Layer 6 (optional): signature — POST a challenge to /sign, recover signer
  // -------------------------------------------------------------------------
  if (options.probeSign) {
    const challenge = generateChallenge();
    result.layers.signature.skipped = false;
    result.layers.signature.challenge = challenge;
    const signUrl = records["agent-endpoint[web]"].replace(/\/$/, "") + "/sign";
    try {
      // Sign protocol: the daemon's /sign endpoint accepts `{message: <string>}`
      // and EIP-191 signs the literal string. Verifier sends the JCS-canonical
      // envelope as the message string so the byte-exact value is reproducible
      // on both sides. Daemon contract: see emilemarcelagustin.eth runtime.
      const message = new TextDecoder().decode(canonicalizeBytes(challenge as never));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let signRes: Response;
      try {
        signRes = await fetchImpl(signUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!signRes.ok) {
        result.layers.signature.passed = false;
        result.layers.signature.errorCode = AgentVerifyErrorCode.SIGNATURE_PROBE_FAILED;
        result.errors.push(`probe-sign: HTTP ${signRes.status}`);
      } else {
        const body = (await signRes.json()) as { signature?: string };
        const signature = body.signature;
        if (!signature) {
          result.layers.signature.passed = false;
          result.layers.signature.errorCode = AgentVerifyErrorCode.SIGNATURE_PROBE_FAILED;
          result.errors.push("probe-sign: response missing `signature` field");
        } else {
          const recovered = await recoverMessageAddress({
            message,
            signature: signature as `0x${string}`,
          });
          result.layers.signature.recovered = recovered;
          if (recovered.toLowerCase() === records["runtime-pubkey"].toLowerCase()) {
            result.layers.signature.passed = true;
          } else {
            result.layers.signature.passed = false;
            result.layers.signature.errorCode = AgentVerifyErrorCode.SIGNATURE_RECOVER_MISMATCH;
            result.errors.push(
              `probe-sign: recovered signer (${recovered}) != runtime-pubkey (${records["runtime-pubkey"]})`,
            );
          }
        }
      }
    } catch (err) {
      result.layers.signature.passed = false;
      result.layers.signature.errorCode = AgentVerifyErrorCode.SIGNATURE_PROBE_FAILED;
      result.errors.push(`probe-sign: ${(err as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Aggregate
  // -------------------------------------------------------------------------
  const requiredLayers = [
    result.layers.records.passed,
    result.layers.schema.passed,
    result.layers.integrity.passed,
    result.layers.binding.passed,
    result.layers.liveness.passed,
  ];
  const sigOK = options.probeSign ? result.layers.signature.passed === true : true;
  result.verified = requiredLayers.every(Boolean) && sigOK;

  return result;
}
