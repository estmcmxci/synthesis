import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  privateKeyToAccount,
  generatePrivateKey,
} from "viem/accounts";
import {
  verifyAgentIdentity,
  AGENT_RECORD_KEYS,
  AgentVerifyErrorCode,
  type AgentVerifyOptions,
} from "./agent-verify.js";
import { canonicalizeBytes } from "../utils/jcs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, "../../test/fixtures/agent-verify");

const recordsFixture = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "records.json"), "utf8"),
) as { records: Record<string, string>; ownerAddress: string };

const agentSchemaBytes = readFileSync(resolve(FIXTURE_DIR, "agent-schema-v1.json"));
const policyBytes = readFileSync(resolve(FIXTURE_DIR, "delegation-policy-v1.json"));

const SCHEMA_URI = recordsFixture.records.schema;
const POLICY_URI = recordsFixture.records.delegation;

function buildOptions(
  overrides: {
    records?: Record<string, string>;
    policyOverride?: Uint8Array;
    schemaOverride?: Uint8Array;
    fetchOverride?: typeof fetch;
    probeSign?: boolean;
  } = {},
): AgentVerifyOptions {
  const records = overrides.records ?? recordsFixture.records;
  return {
    probeSign: overrides.probeSign,
    fetch:
      overrides.fetchOverride ??
      (async () =>
        new Response("{ \"agent\": \"emilemarcelagustin.eth\", \"ok\": true }", {
          status: 200,
          headers: { "content-type": "application/json" },
        })),
    testHooks: {
      readRecords: async () => records,
      fetchIpfs: async (uri: string) => {
        if (uri === SCHEMA_URI)
          return { bytes: overrides.schemaOverride ?? new Uint8Array(agentSchemaBytes), gateway: "fixture" };
        if (uri === POLICY_URI)
          return { bytes: overrides.policyOverride ?? new Uint8Array(policyBytes), gateway: "fixture" };
        throw new Error(`unexpected fetch: ${uri}`);
      },
      getOwner: async () => recordsFixture.ownerAddress as `0x${string}`,
    },
  };
}

test("happy path — all 5 layers pass against frozen fixtures", async () => {
  const result = await verifyAgentIdentity("emilemarcelagustin.eth", buildOptions());
  assert.equal(result.verified, true, JSON.stringify(result.errors));
  assert.equal(result.layers.records.passed, true);
  assert.equal(result.layers.schema.passed, true);
  assert.equal(result.layers.integrity.passed, true);
  assert.equal(result.layers.binding.passed, true);
  assert.equal(result.layers.liveness.passed, true);
  assert.equal(result.layers.signature.skipped, true);
  assert.equal(
    result.layers.integrity.computed,
    "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
  );
});

test("missing record — `policy-hash` absent fails records layer with stable code", async () => {
  const broken = { ...recordsFixture.records };
  delete (broken as Record<string, string>)["policy-hash"];
  const result = await verifyAgentIdentity(
    "emilemarcelagustin.eth",
    buildOptions({ records: broken }),
  );
  assert.equal(result.verified, false);
  assert.equal(result.layers.records.passed, false);
  assert.equal(result.layers.records.errorCode, AgentVerifyErrorCode.RECORDS_MISSING);
  assert.deepEqual(result.layers.records.missing, ["policy-hash"]);
  // Downstream layers should not have been evaluated
  assert.equal(result.layers.schema.passed, false);
  assert.equal(result.layers.integrity.passed, false);
});

test("malformed record — `policy-hash` not 0x-32-bytes fails with malformed code", async () => {
  const broken = { ...recordsFixture.records, "policy-hash": "0xnothex" };
  const result = await verifyAgentIdentity(
    "emilemarcelagustin.eth",
    buildOptions({ records: broken }),
  );
  assert.equal(result.layers.records.passed, false);
  assert.equal(result.layers.records.errorCode, AgentVerifyErrorCode.RECORDS_MALFORMED);
  assert.equal(result.layers.records.malformed[0]?.key, "policy-hash");
});

test("tampered policy — modifying a value changes computed hash and fails integrity", async () => {
  // Tamper with a real value (issued-at) so the bytes change but the JSON is
  // still parseable — exercises the integrity layer, not the parse-fail
  // branch which is covered by POLICY_FETCH_FAILED.
  const policy = JSON.parse(new TextDecoder().decode(policyBytes));
  policy["issued-at"] = "1999-01-01T00:00:00Z";
  const tampered = new TextEncoder().encode(JSON.stringify(policy));
  const result = await verifyAgentIdentity(
    "emilemarcelagustin.eth",
    buildOptions({ policyOverride: tampered }),
  );
  assert.equal(result.layers.integrity.passed, false);
  assert.equal(
    result.layers.integrity.errorCode,
    AgentVerifyErrorCode.INTEGRITY_HASH_MISMATCH,
  );
  assert.equal(
    result.layers.integrity.expected,
    "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
  );
  assert.notEqual(result.layers.integrity.computed, result.layers.integrity.expected);
});

test("schema fail — runtime-pubkey not 0x-address fails schema layer", async () => {
  const broken = { ...recordsFixture.records, "runtime-pubkey": "0xnotanaddress" };
  // The records-layer regex check will fire first (it's strictly typed). To
  // exercise the schema layer in isolation we keep records syntactically OK
  // and instead inject a schema that demands a property not present.
  const tighterSchema = JSON.stringify({
    type: "object",
    required: ["nonexistent-key"],
    properties: { "nonexistent-key": { type: "string" } },
  });
  const result = await verifyAgentIdentity(
    "emilemarcelagustin.eth",
    buildOptions({
      schemaOverride: new TextEncoder().encode(tighterSchema),
    }),
  );
  // records layer still passes
  assert.equal(result.layers.records.passed, true);
  assert.equal(result.layers.schema.passed, false);
  assert.equal(
    result.layers.schema.errorCode,
    AgentVerifyErrorCode.SCHEMA_VALIDATION_FAILED,
  );
  assert.ok(
    result.layers.schema.errors.some((e) => /nonexistent-key/.test(e.message)),
  );
  // Confirm the records-malformed branch indeed catches `runtime-pubkey`
  // when malformed (sanity for the assertion above):
  const r2 = await verifyAgentIdentity(
    "emilemarcelagustin.eth",
    buildOptions({ records: broken }),
  );
  assert.equal(r2.layers.records.passed, false);
});

test("binding mismatch — session-key.address != runtime-pubkey", async () => {
  const policy = JSON.parse(new TextDecoder().decode(policyBytes));
  policy["active-session-key"].address = "0x" + "a".repeat(40);
  const tampered = new TextEncoder().encode(JSON.stringify(policy));
  // Re-sign integrity by also rewriting the policy-hash record so the
  // integrity layer doesn't fail first and short-circuit binding.
  const { keccak256, toHex } = await import("viem");
  const newHash = keccak256(toHex(canonicalizeBytes(policy)));
  const recordsForcedHash = { ...recordsFixture.records, "policy-hash": newHash };
  const result = await verifyAgentIdentity(
    "emilemarcelagustin.eth",
    buildOptions({ policyOverride: tampered, records: recordsForcedHash }),
  );
  assert.equal(result.layers.integrity.passed, true);
  assert.equal(result.layers.binding.passed, false);
  assert.equal(
    result.layers.binding.errorCode,
    AgentVerifyErrorCode.BINDING_SESSION_KEY_MISMATCH,
  );
});

test("probe-sign — recovered signer matches runtime-pubkey ⇒ pass", async () => {
  // Build a synthetic runtime keypair and rewrite records to use its address,
  // so we can deterministically produce a signature that must verify.
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  const runtimePubkey = account.address;
  const recordsWithKey: Record<string, string> = {
    ...recordsFixture.records,
    "runtime-pubkey": runtimePubkey,
  };
  // also patch the policy doc's active-session-key.address + policy-hash so
  // earlier layers still pass.
  const policy = JSON.parse(new TextDecoder().decode(policyBytes));
  policy["active-session-key"].address = runtimePubkey;
  const newPolicyBytes = new TextEncoder().encode(JSON.stringify(policy));
  const { keccak256, toHex } = await import("viem");
  const newHash = keccak256(toHex(canonicalizeBytes(policy)));
  recordsWithKey["policy-hash"] = newHash;

  const fetchMock: typeof fetch = async (input: RequestInfo | URL, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/health")) {
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/sign") && init?.method === "POST") {
      // Verifier sends `{message: <jcs-canonical-string>}` per the locked
      // protocol — daemon signs the literal string as EIP-191.
      const body = JSON.parse(init.body as string) as { message: string };
      const signature = await account.signMessage({ message: body.message });
      return new Response(JSON.stringify({ signature }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await verifyAgentIdentity(
    "emilemarcelagustin.eth",
    buildOptions({
      records: recordsWithKey,
      policyOverride: newPolicyBytes,
      fetchOverride: fetchMock,
      probeSign: true,
    }),
  );

  assert.equal(result.verified, true, JSON.stringify(result.errors));
  assert.equal(result.layers.signature.passed, true);
  assert.equal(result.layers.signature.skipped, false);
  assert.equal(result.layers.signature.recovered?.toLowerCase(), runtimePubkey.toLowerCase());
});

test("probe-sign mismatch — daemon signs with a different key ⇒ signature layer fails", async () => {
  // Daemon signs with key A but records pin runtime-pubkey to key B.
  const recordsKeyB = { ...recordsFixture.records };
  // generate key A (the daemon)
  const pkA = generatePrivateKey();
  const accountA = privateKeyToAccount(pkA);
  const fetchMock: typeof fetch = async (input: RequestInfo | URL, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/health")) return new Response("{}", { status: 200 });
    if (url.endsWith("/sign") && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as { message: string };
      const signature = await accountA.signMessage({ message: body.message });
      return new Response(JSON.stringify({ signature }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await verifyAgentIdentity(
    "emilemarcelagustin.eth",
    buildOptions({
      records: recordsKeyB,
      fetchOverride: fetchMock,
      probeSign: true,
    }),
  );
  assert.equal(result.layers.signature.passed, false);
  assert.equal(
    result.layers.signature.errorCode,
    AgentVerifyErrorCode.SIGNATURE_RECOVER_MISMATCH,
  );
  assert.equal(result.verified, false);
});

test("https:// URIs flow through plain fetch, not the IPFS gateway race", async () => {
  // A deployment using https:// for `schema` and `delegation` (allowed by
  // the records-layer regex and the agent-schema spec) must be fetchable.
  // testHooks.fetchIpfs is intentionally absent so https traffic goes
  // through options.fetch.
  const httpsRecords = {
    ...recordsFixture.records,
    schema: "https://emilemarcelagustin.eth.limo/schemas/agent-schema-v1.json",
    delegation: "https://emilemarcelagustin.eth.limo/policies/delegation-policy-v1.json",
  };
  let httpsCalls = 0;
  const fetchMock: typeof fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/health")) return new Response("{}", { status: 200 });
    if (url.includes("agent-schema-v1.json")) {
      httpsCalls++;
      return new Response(agentSchemaBytes, { status: 200 });
    }
    if (url.includes("delegation-policy-v1.json")) {
      httpsCalls++;
      return new Response(policyBytes, { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const result = await verifyAgentIdentity("emilemarcelagustin.eth", {
    fetch: fetchMock,
    testHooks: {
      readRecords: async () => httpsRecords,
      // No fetchIpfs hook — https branch in fetchByScheme handles both
      getOwner: async () => recordsFixture.ownerAddress as `0x${string}`,
    },
  });
  assert.equal(httpsCalls, 2, "schema + policy should each be fetched once via https");
  assert.equal(result.layers.records.passed, true);
  assert.equal(result.layers.schema.passed, true);
  assert.equal(result.layers.integrity.passed, true);
});

test("cbor: URI — rejected with explicit unsupported-scheme error", async () => {
  const cborRecords = {
    ...recordsFixture.records,
    schema: "cbor:bafy/agent-schema-v1.cbor",
  };
  const result = await verifyAgentIdentity("emilemarcelagustin.eth", {
    fetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
    testHooks: {
      readRecords: async () => cborRecords,
      fetchIpfs: async () => {
        throw new Error("should not be called for cbor:");
      },
      getOwner: async () => recordsFixture.ownerAddress as `0x${string}`,
    },
  });
  assert.equal(result.layers.schema.passed, false);
  assert.equal(
    result.layers.schema.errorCode,
    AgentVerifyErrorCode.SCHEMA_FETCH_FAILED,
  );
  assert.ok(result.errors.some((e) => /cbor:/.test(e)));
});

test("AGENT_RECORD_KEYS is the locked 9-key list", () => {
  assert.equal(AGENT_RECORD_KEYS.length, 9);
  assert.ok(AGENT_RECORD_KEYS.includes("policy-hash"));
  assert.ok(AGENT_RECORD_KEYS.includes("agent-endpoint[web]"));
});
