import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentVerifyErrorCode, type AgentVerifyResult } from "@synthesis/resolver";
import { exitCodeFor, formatResult, agentVerify } from "./agent-verify";

function strip(s: string): string {
  // remove ANSI escape sequences so tests don't depend on the colors lib
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const baseResult: AgentVerifyResult = {
  ensName: "emilemarcelagustin.eth",
  verified: true,
  identityCard: {
    ensName: "emilemarcelagustin.eth",
    agentId: "24994",
    registryChain: "eip155:8453",
    registryAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    ownerAddress: "0xeb0ABB367540f90B57b3d5719fd2b9c740a15022",
    kernelWallet: "0xEc0d3C782C6087235Ab16d8c4d4188d10DFD796A",
    runtimePubkey: "0x8973B6897554017d208DBeE2Ef5Fb8Fb046A6aEB",
    endpointWeb: "https://xxje1rfb.agents.pinata.cloud/app",
  },
  layers: {
    records: { passed: true, missing: [], malformed: [] },
    schema: { passed: true, schemaUri: "ipfs://x/schemas/agent-schema-v1.json", errors: [] },
    integrity: {
      passed: true,
      expected: "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
      computed: "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
      policyGateway: "https://w3s.link/ipfs/",
    },
    binding: { passed: true, details: ["everything matches"] },
    liveness: { passed: true, responseStatus: 200 },
    signature: { passed: null, skipped: true },
  },
  policy: {
    uri: "ipfs://x/policies/delegation-policy-v1.json",
    version: "v1",
    scope: ["eip191-sign", "eip712-sign"],
    permittedClasses: ["identity-attestation"],
    prohibited: ["userop-broadcast"],
  },
  warnings: [],
  errors: [],
};

test("formatResult json — emits the locked AgentVerifyResult shape", () => {
  const out = formatResult(baseResult, "json", false);
  const parsed = JSON.parse(out);
  // top-level keys
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ["ensName", "errors", "identityCard", "layers", "policy", "verified", "warnings"],
  );
  // layers keys
  assert.deepEqual(
    Object.keys(parsed.layers).sort(),
    ["binding", "integrity", "liveness", "records", "schema", "signature"],
  );
  // identity card keys (shape locked for the explorer route to type against)
  assert.deepEqual(
    Object.keys(parsed.identityCard).sort(),
    [
      "agentId",
      "endpointWeb",
      "ensName",
      "kernelWallet",
      "ownerAddress",
      "registryAddress",
      "registryChain",
      "runtimePubkey",
    ],
  );
});

test("formatResult human — pass case shows VERIFIED + 5 layer ✓ rows", () => {
  const out = strip(formatResult(baseResult, "human", false));
  assert.match(out, /Identity Card/);
  assert.match(out, /VERIFIED/);
  assert.match(out, /✓ Records/);
  assert.match(out, /✓ Schema/);
  assert.match(out, /✓ Integrity/);
  assert.match(out, /✓ Binding/);
  assert.match(out, /✓ Liveness/);
  // signature skipped row uses a "-" not a "✓" or "✗"
  assert.match(out, /- Signature\s*: skipped/);
});

test("formatResult human — failed records shows missing + malformed", () => {
  const failed: AgentVerifyResult = {
    ...baseResult,
    verified: false,
    layers: {
      ...baseResult.layers,
      records: {
        passed: false,
        missing: ["policy-hash"],
        malformed: [{ key: "runtime-pubkey", reason: "not a 0x-address" }],
        errorCode: AgentVerifyErrorCode.RECORDS_MISSING,
      },
    },
  };
  const out = strip(formatResult(failed, "human", false));
  assert.match(out, /✗ Records/);
  assert.match(out, /missing: policy-hash/);
  assert.match(out, /malformed: runtime-pubkey/);
  assert.match(out, /FAILED/);
});

test("exitCodeFor — 0 on verified, 1 on failure", () => {
  assert.equal(exitCodeFor(baseResult), 0);
  const failed = { ...baseResult, verified: false };
  assert.equal(exitCodeFor(failed), 1);
});

test("agentVerify rejects non-numeric --timeout with exit code 2", async () => {
  const prevExit = process.exitCode;
  process.exitCode = 0;
  await assert.rejects(
    () => agentVerify({ name: "vitalik.eth", timeout: "foo" }),
    /Invalid --timeout/,
  );
  assert.equal(process.exitCode, 2);
  process.exitCode = prevExit;
});

test("agentVerify rejects negative --timeout with exit code 2", async () => {
  const prevExit = process.exitCode;
  process.exitCode = 0;
  await assert.rejects(
    () => agentVerify({ name: "vitalik.eth", timeout: "-5" }),
    /Invalid --timeout/,
  );
  assert.equal(process.exitCode, 2);
  process.exitCode = prevExit;
});

test("formatResult json — failure carries error codes verbatim", () => {
  const failed: AgentVerifyResult = {
    ...baseResult,
    verified: false,
    layers: {
      ...baseResult.layers,
      integrity: {
        passed: false,
        expected: "0xaaaa",
        computed: "0xbbbb",
        policyGateway: "https://w3s.link/ipfs/",
        errorCode: AgentVerifyErrorCode.INTEGRITY_HASH_MISMATCH,
      },
    },
  };
  const parsed = JSON.parse(formatResult(failed, "json", false));
  assert.equal(parsed.layers.integrity.errorCode, "INTEGRITY_HASH_MISMATCH");
});
