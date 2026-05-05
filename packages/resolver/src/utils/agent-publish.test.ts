import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, namehash } from "viem";
import { normalize } from "viem/ens";
import {
  validateAgentRecords,
  buildRecordList,
  encodeSetTextCalls,
  encodeMulticall,
  publishAgentRecords,
  type AgentPublishRecords,
} from "./agent-publish.js";

const VALID: AgentPublishRecords = {
  schema: "ipfs://bafy.../schemas/agent-schema-v1.json",
  "runtime-pubkey": "0x8973B6897554017d208DBeE2Ef5Fb8Fb046A6aEB",
  "runtime-status": "active",
  "kernel-wallet": "0xEc0d3C782C6087235Ab16d8c4d4188d10DFD796A",
  "agent-endpoint[web]": "https://xxje1rfb.agents.pinata.cloud/app",
  delegation: "ipfs://bafy.../policies/delegation-policy-v1.json",
  "policy-hash": "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
  "policy-version": "v1",
};

const RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" as const;

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
] as const;

// ============================================================================
// Validation
// ============================================================================

test("validateAgentRecords accepts a fully-populated valid record set", () => {
  assert.deepEqual(validateAgentRecords(VALID), []);
});

test("validateAgentRecords reports missing required records", () => {
  const partial = { ...VALID } as Partial<AgentPublishRecords>;
  delete partial["runtime-pubkey"];
  delete partial["agent-endpoint[web]"];
  const issues = validateAgentRecords(partial);
  assert.ok(issues.some((i) => i.key === "runtime-pubkey"));
  assert.ok(issues.some((i) => i.key === "agent-endpoint[web]"));
});

test("validateAgentRecords reports per-key reason for each malformed value", () => {
  const issues = validateAgentRecords({
    schema: "no-scheme.example",
    "runtime-pubkey": "0xnotanaddress",
    "runtime-status": "blarg" as never,
    "kernel-wallet": "0xEc0d3C782C6087235Ab16d8c4d4188d10DFD796A",
    "agent-endpoint[web]": "ftp://nope",
    delegation: "ipfs://valid/x.json",
    "policy-hash": "0x123",
    "policy-version": "wrong",
  });
  const byKey = Object.fromEntries(issues.map((i) => [i.key, i.reason]));
  assert.match(byKey.schema, /must start with/);
  assert.match(byKey["runtime-pubkey"], /not a 0x-prefixed/);
  assert.match(byKey["runtime-status"], /active\|paused\|revoked/);
  assert.match(byKey["agent-endpoint[web]"], /not an http\(s\)/);
  assert.match(byKey["policy-hash"], /not a 0x-prefixed 32-byte/);
  assert.match(byKey["policy-version"], /v<N>/);
});

test("validateAgentRecords accepts class=Agent and rejects other class values", () => {
  assert.deepEqual(validateAgentRecords({ ...VALID, class: "Agent" }), []);
  const issues = validateAgentRecords({ ...VALID, class: "NotAnAgent" });
  assert.ok(issues.some((i) => i.key === "class"));
});

// ============================================================================
// Records assembly
// ============================================================================

test("buildRecordList — canonical 9 records in spec order", () => {
  const list = buildRecordList(VALID);
  const keys = list.map((x) => x.key);
  assert.deepEqual(keys, [
    "class",
    "schema",
    "runtime-pubkey",
    "runtime-status",
    "kernel-wallet",
    "agent-endpoint[web]",
    "delegation",
    "policy-hash",
    "policy-version",
  ]);
});

test("buildRecordList — class defaults to Agent", () => {
  const list = buildRecordList(VALID);
  assert.equal(list[0].key, "class");
  assert.equal(list[0].value, "Agent");
});

test("buildRecordList — optional records (delegation/policy-*) are omitted when missing", () => {
  const minimal: AgentPublishRecords = {
    schema: VALID.schema,
    "runtime-pubkey": VALID["runtime-pubkey"],
    "runtime-status": VALID["runtime-status"],
    "kernel-wallet": VALID["kernel-wallet"],
    "agent-endpoint[web]": VALID["agent-endpoint[web]"],
  };
  const list = buildRecordList(minimal);
  const keys = list.map((x) => x.key);
  assert.equal(keys.length, 6);
  assert.ok(!keys.includes("delegation"));
  assert.ok(!keys.includes("policy-hash"));
  assert.ok(!keys.includes("policy-version"));
});

test("buildRecordList --legacy-aliases — appends 7 deprecated keys, mirrors bash exactly", () => {
  const list = buildRecordList(VALID, { legacyAliases: true });
  const keys = list.map((x) => x.key);
  // first 9 are canonical, last 7 are aliases
  assert.equal(keys.length, 9 + 7);
  // session_signer_v1 must alias runtime-pubkey, not be its own value
  const sessionSigner = list.find((x) => x.key === "agent.session_signer_v1");
  assert.equal(sessionSigner?.value, VALID["runtime-pubkey"]);
  // confirm the full 7-key list
  const aliasKeys = keys.slice(9);
  assert.deepEqual(aliasKeys, [
    "agent.runtime_pubkey_v1",
    "agent.runtime_status_v1",
    "agent.kernel_wallet_v1",
    "agent.session_signer_v1",
    "agent.policy_hash_v1",
    "agent.policy_version_v1",
    "agent.delegation_v1",
  ]);
});

test("buildRecordList --legacy-aliases skips alias rows whose canonical record is absent", () => {
  const minimal: AgentPublishRecords = {
    schema: VALID.schema,
    "runtime-pubkey": VALID["runtime-pubkey"],
    "runtime-status": VALID["runtime-status"],
    "kernel-wallet": VALID["kernel-wallet"],
    "agent-endpoint[web]": VALID["agent-endpoint[web]"],
  };
  const list = buildRecordList(minimal, { legacyAliases: true });
  const keys = list.map((x) => x.key);
  // canonical 6 + 4 aliases (pubkey, status, kernel, session_signer) — no policy aliases
  assert.equal(keys.length, 6 + 4);
  assert.ok(!keys.includes("agent.policy_hash_v1"));
  assert.ok(!keys.includes("agent.delegation_v1"));
});

// ============================================================================
// Calldata encoding
// ============================================================================

test("encodeSetTextCalls — each call decodes back to its (node, key, value)", () => {
  const list = buildRecordList(VALID);
  const calls = encodeSetTextCalls("emilemarcelagustin.eth", list);
  const expectedNode = namehash(normalize("emilemarcelagustin.eth"));
  assert.equal(calls.length, list.length);
  for (let i = 0; i < calls.length; i++) {
    const decoded = decodeFunctionData({ abi: RESOLVER_ABI, data: calls[i] });
    assert.equal(decoded.functionName, "setText");
    assert.equal(decoded.args[0], expectedNode);
    assert.equal(decoded.args[1], list[i].key);
    assert.equal(decoded.args[2], list[i].value);
  }
});

test("encodeMulticall — wraps the setText blob array as multicall(bytes[])", () => {
  const list = buildRecordList(VALID);
  const calls = encodeSetTextCalls("emilemarcelagustin.eth", list);
  const wrapped = encodeMulticall(calls);
  const decoded = decodeFunctionData({ abi: RESOLVER_ABI, data: wrapped });
  assert.equal(decoded.functionName, "multicall");
  assert.deepEqual(Array.from(decoded.args[0]), calls);
});

// ============================================================================
// publishAgentRecords (end-to-end with mocked client)
// ============================================================================

function mockClient(currentRecords: Record<string, string> = {}): {
  client: any;
  reads: { node: string; key: string }[];
} {
  const reads: { node: string; key: string }[] = [];
  const client = {
    async readContract({ args }: { args: [string, string] }) {
      reads.push({ node: args[0], key: args[1] });
      return currentRecords[args[1]] ?? "";
    },
  };
  return { client, reads };
}

test("publishAgentRecords default — broadcast is OFF, no send callback called", async () => {
  const { client } = mockClient();
  let sendCalled = false;
  const send = async () => {
    sendCalled = true;
    return "0x" + "00".repeat(32) as `0x${string}`;
  };
  const plan = await publishAgentRecords(
    "emilemarcelagustin.eth",
    VALID,
    client,
    { resolverAddress: RESOLVER, send },
  );
  assert.equal(plan.broadcast, false);
  assert.equal(plan.txHashes, undefined);
  assert.equal(sendCalled, false);
  assert.ok(plan.multicallCalldata?.startsWith("0x"));
  assert.equal(plan.records.length, 9);
});

test("publishAgentRecords --broadcast --multicall (default) — one send call with multicall calldata", async () => {
  const { client } = mockClient();
  const sentArgs: { calldata: `0x${string}`; target: string }[] = [];
  const send = async (calldata: `0x${string}`, target: `0x${string}`) => {
    sentArgs.push({ calldata, target });
    return "0xdeadbeef" as `0x${string}`;
  };
  const plan = await publishAgentRecords(
    "emilemarcelagustin.eth",
    VALID,
    client,
    { resolverAddress: RESOLVER, send, broadcast: true },
  );
  assert.equal(plan.broadcast, true);
  assert.equal(sentArgs.length, 1);
  assert.equal(sentArgs[0].target, RESOLVER);
  assert.equal(sentArgs[0].calldata, plan.multicallCalldata);
  assert.deepEqual(plan.txHashes, ["0xdeadbeef"]);
});

test("publishAgentRecords --broadcast --no-multicall — one send call per record (matches bash)", async () => {
  const { client } = mockClient();
  const sentArgs: `0x${string}`[] = [];
  const send = async (calldata: `0x${string}`) => {
    sentArgs.push(calldata);
    return ("0x" + sentArgs.length.toString(16).padStart(64, "0")) as `0x${string}`;
  };
  const plan = await publishAgentRecords(
    "emilemarcelagustin.eth",
    VALID,
    client,
    { resolverAddress: RESOLVER, send, broadcast: true, multicall: false },
  );
  assert.equal(sentArgs.length, 9);
  assert.equal(plan.txHashes?.length, 9);
  assert.equal(plan.multicallCalldata, undefined);
});

test("publishAgentRecords — diffs against chain state and tags changed records", async () => {
  const { client } = mockClient({
    class: "Agent",
    schema: VALID.schema,
    "runtime-pubkey": "0x" + "00".repeat(20), // stale value
  });
  const plan = await publishAgentRecords(
    "emilemarcelagustin.eth",
    VALID,
    client,
    { resolverAddress: RESOLVER },
  );
  const byKey = Object.fromEntries(plan.diffs!.map((d) => [d.key, d]));
  assert.equal(byKey.class.changed, false);
  assert.equal(byKey.schema.changed, false);
  assert.equal(byKey["runtime-pubkey"].changed, true);
  assert.equal(byKey["runtime-pubkey"].current, "0x" + "00".repeat(20));
  assert.equal(byKey["runtime-pubkey"].next, VALID["runtime-pubkey"]);
});

test("publishAgentRecords throws on validation errors with all reasons aggregated", async () => {
  const { client } = mockClient();
  await assert.rejects(
    () =>
      publishAgentRecords(
        "emilemarcelagustin.eth",
        { ...VALID, "runtime-pubkey": "0xbad", "policy-hash": "0xbad" },
        client,
        { resolverAddress: RESOLVER },
      ),
    /runtime-pubkey.*policy-hash|policy-hash.*runtime-pubkey/s,
  );
});

test("publishAgentRecords --broadcast without send callback — throws (defense)", async () => {
  const { client } = mockClient();
  await assert.rejects(
    () =>
      publishAgentRecords("emilemarcelagustin.eth", VALID, client, {
        resolverAddress: RESOLVER,
        broadcast: true,
      }),
    /requires a `send` callback/,
  );
});
