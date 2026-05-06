import { keccak256, toHex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalizeBytes } from "@synthesis/resolver";
import type { LayerName } from "../shared/types.ts";

// =============================================================================
// Test keys — well-known anvil/hardhat defaults. Deliberately non-secret.
// =============================================================================

const RUNTIME_PRIV = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const RUNTIME_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const KERNEL_ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const OWNER_ADDR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
const OTHER_PRIV = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

export const FIXTURE_ENS_NAME = "conformance-fixture-v1.eth";
const FIXTURE_ENDPOINT = "https://conformance-fixture.invalid";
const SCHEMA_URI = "ipfs://bafy-fixture-schema-v1";
const POLICY_URI = "ipfs://bafy-fixture-policy-v1";

// =============================================================================
// Schema doc (subset of agent-schema-v1.json sufficient to validate records)
// =============================================================================

const FIXTURE_SCHEMA_DOC: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: SCHEMA_URI,
  type: "object",
  additionalProperties: true,
  properties: {
    class: { type: "string", const: "Agent" },
    schema: { type: "string", pattern: "^(ipfs://|cbor:|https://).+" },
    "runtime-pubkey": { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
    "runtime-status": { type: "string", enum: ["active", "paused", "revoked"] },
    "kernel-wallet": { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
    "policy-hash": { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
    "policy-version": { type: "string", pattern: "^v[0-9]+(\\.[0-9]+){0,2}$" },
    delegation: { type: "string", pattern: "^(ipfs://|https://).+" },
  },
};

// =============================================================================
// Canonical valid policy doc
// =============================================================================

function buildValidPolicyDoc(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: POLICY_URI,
    agent: {
      "ens-name": FIXTURE_ENS_NAME,
      "kernel-wallet": KERNEL_ADDR,
      chain: "base-mainnet",
      "chain-id": 8453,
    },
    version: "v1",
    "issued-at": "2026-05-01T00:00:00Z",
    delegators: [
      { label: "owner-eoa", address: OWNER_ADDR, ens: null, role: "primary" },
    ],
    "delegation-policy": {
      threshold: "1-of-1",
      scope: ["eip191-sign"],
      "ttl-hours": 168,
      "permitted-message-classes": ["identity-attestation"],
      prohibited: ["userop-broadcast", "value-transfer", "contract-write"],
    },
    "active-session-key": {
      address: RUNTIME_ADDR,
      "issued-at": "2026-05-01T00:00:00Z",
      "ttl-hours": 168,
      "kernel-wallet": KERNEL_ADDR,
    },
    revocation: {
      mechanism: "version-bump-and-rotate",
      procedure: ["fixture procedure"],
      verification: "fixture verification",
    },
  };
}

function policyHash(doc: Record<string, unknown>): `0x${string}` {
  return keccak256(toHex(canonicalizeBytes(doc as never)));
}

function buildRecords(policyDoc: Record<string, unknown>): Record<string, string> {
  return {
    class: "Agent",
    schema: SCHEMA_URI,
    "runtime-pubkey": RUNTIME_ADDR,
    "runtime-status": "active",
    "kernel-wallet": KERNEL_ADDR,
    "agent-endpoint[web]": FIXTURE_ENDPOINT,
    delegation: POLICY_URI,
    "policy-hash": policyHash(policyDoc),
    "policy-version": "v1",
  };
}

// =============================================================================
// Public fixture shape
// =============================================================================

export interface Fixture {
  id: string;
  ensName: string;
  records: Record<string, string>;
  policyDoc: Record<string, unknown>;
  schemaDoc: Record<string, unknown>;
  ownerAddress: Address;
  /** EIP-191 signer for /sign probe. When `null`, /sign returns 500. */
  signerPrivateKey: `0x${string}` | null;
  /** When `false`, /health and /sign return network errors. */
  endpointReachable: boolean;
  /** Layer the fixture is engineered to fail. `null` for the valid case. */
  expectFailingLayer: LayerName | null;
}

export function buildValidFixture(): Fixture {
  const policyDoc = buildValidPolicyDoc();
  return {
    id: "valid",
    ensName: FIXTURE_ENS_NAME,
    records: buildRecords(policyDoc),
    policyDoc,
    schemaDoc: FIXTURE_SCHEMA_DOC,
    ownerAddress: OWNER_ADDR,
    signerPrivateKey: RUNTIME_PRIV,
    endpointReachable: true,
    expectFailingLayer: null,
  };
}

// =============================================================================
// Mutators — each derives a one-field-diff negative case from the valid fixture
// =============================================================================

/** Flip one byte of the policy doc — keccak256 changes, integrity must fail. */
export function tamperPolicy(base: Fixture): Fixture {
  const tampered = JSON.parse(JSON.stringify(base.policyDoc)) as Record<string, unknown>;
  (tampered.version as string) = "v1-tampered";
  // Records still claim original hash; integrity layer recomputes from the
  // mutated policyDoc and finds a mismatch.
  return {
    ...base,
    id: "tamper-policy",
    policyDoc: tampered,
    expectFailingLayer: "integrity",
  };
}

/** Remove one ENSIP-64 record — records layer must fail. */
export function removeRecord(base: Fixture, key: string): Fixture {
  const records = { ...base.records };
  delete records[key];
  return {
    ...base,
    id: `remove-record-${key}`,
    records,
    expectFailingLayer: "records",
  };
}

/** Replace policy.active-session-key.address with a different address — binding must fail. */
export function expireSession(base: Fixture): Fixture {
  const policyDoc = JSON.parse(JSON.stringify(base.policyDoc)) as Record<string, unknown>;
  const ask = policyDoc["active-session-key"] as Record<string, unknown>;
  ask.address = "0x0000000000000000000000000000000000000001";
  // Keep records pointing at the original runtime-pubkey; recompute hash so
  // integrity passes — we want to isolate the binding failure.
  const records = { ...base.records, "policy-hash": policyHash(policyDoc) };
  return {
    ...base,
    id: "expire-session",
    policyDoc,
    records,
    expectFailingLayer: "binding",
  };
}

/** Mismatch kernel-wallet between record and policy — binding must fail. */
export function mismatchKernelWallet(base: Fixture): Fixture {
  const records = {
    ...base.records,
    "kernel-wallet": "0x0000000000000000000000000000000000000002",
  };
  return {
    ...base,
    id: "mismatch-kernel-wallet",
    records,
    expectFailingLayer: "binding",
  };
}

/**
 * Tighten the published schema so it rejects a value the records-layer regex
 * accepts. Records pass the regex check, then fail JSON-schema validation —
 * isolating a schema-layer failure.
 */
export function schemaRejectsRecords(base: Fixture): Fixture {
  const schemaDoc = JSON.parse(JSON.stringify(base.schemaDoc)) as Record<string, unknown>;
  const props = schemaDoc.properties as Record<string, Record<string, unknown>>;
  // Records layer accepts active|paused|revoked; schema demands a const that
  // does not match → schema-only failure.
  props["runtime-status"] = { type: "string", const: "schema-only-active" };
  return {
    ...base,
    id: "schema-rejects-records",
    schemaDoc,
    expectFailingLayer: "schema",
  };
}

/** Endpoint unreachable — liveness must fail. */
export function unreachableEndpoint(base: Fixture): Fixture {
  return {
    ...base,
    id: "unreachable-endpoint",
    endpointReachable: false,
    expectFailingLayer: "liveness",
  };
}

/** Daemon signs with a different key — signature must fail. */
export function wrongSigner(base: Fixture): Fixture {
  return {
    ...base,
    id: "wrong-signer",
    signerPrivateKey: OTHER_PRIV,
    expectFailingLayer: "signature",
  };
}

/** Records carry a stale policy-hash — integrity must fail. */
export function stalePolicyHash(base: Fixture): Fixture {
  const records = {
    ...base.records,
    "policy-hash": "0x" + "0".repeat(64),
  };
  return {
    ...base,
    id: "stale-policy-hash",
    records,
    expectFailingLayer: "integrity",
  };
}

// =============================================================================
// Helpers for the suite — convert a Fixture into testHooks
// =============================================================================

const enc = new TextEncoder();

export function ipfsBytesFor(fixture: Fixture, uri: string): Uint8Array | null {
  if (uri === SCHEMA_URI) {
    return enc.encode(JSON.stringify(fixture.schemaDoc));
  }
  if (uri === POLICY_URI) {
    return enc.encode(JSON.stringify(fixture.policyDoc));
  }
  return null;
}

export async function buildSignResponse(
  fixture: Fixture,
  body: string,
): Promise<Response> {
  if (!fixture.signerPrivateKey) {
    return new Response(JSON.stringify({ error: "no signer configured" }), {
      status: 500,
    });
  }
  const parsed = JSON.parse(body) as { message?: string };
  if (!parsed.message) {
    return new Response(JSON.stringify({ error: "missing message" }), { status: 400 });
  }
  const account = privateKeyToAccount(fixture.signerPrivateKey);
  const signature = await account.signMessage({ message: parsed.message });
  return new Response(JSON.stringify({ signature }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function buildHealthResponse(fixture: Fixture): Response {
  return new Response(
    JSON.stringify({ agent: fixture.ensName, status: "ok" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
