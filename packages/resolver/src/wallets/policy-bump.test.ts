import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { keccak256, toHex } from "viem";
import { bumpPolicy, nextMajorVersion, type PolicyDoc } from "./policy-bump.js";
import { canonicalizeBytes } from "../utils/jcs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = resolve(
  __dirname,
  "../../test/fixtures/agent-verify/delegation-policy-v1.json",
);

function loadV1(): PolicyDoc {
  return JSON.parse(readFileSync(POLICY_PATH, "utf8")) as PolicyDoc;
}

const NEW_KEY = "0x1111222233334444555566667777888899990000" as `0x${string}`;
const FIXED_TIMESTAMP = "2026-05-12T00:00:00Z";

test("bumpPolicy — produces valid v2 doc with the new session key + timestamp", () => {
  const v1 = loadV1();
  const v2 = bumpPolicy(v1, {
    newVersion: "v2",
    newSessionKeyAddress: NEW_KEY,
    issuedAt: FIXED_TIMESTAMP,
  });
  assert.equal(v2.version, "v2");
  assert.equal(v2["issued-at"], FIXED_TIMESTAMP);
  assert.equal(v2["active-session-key"]?.address, NEW_KEY);
  assert.equal(v2["active-session-key"]?.["issued-at"], FIXED_TIMESTAMP);
});

test("bumpPolicy — carries forward all non-rotated fields byte-for-byte", () => {
  const v1 = loadV1();
  const v2 = bumpPolicy(v1, {
    newVersion: "v2",
    newSessionKeyAddress: NEW_KEY,
    issuedAt: FIXED_TIMESTAMP,
  });
  // delegators array carries forward verbatim
  assert.deepEqual(v2.delegators, v1.delegators);
  // delegation-policy semantics unchanged (scope, threshold, prohibited)
  assert.deepEqual(v2["delegation-policy"], v1["delegation-policy"]);
  // agent block unchanged (ens-name, kernel-wallet, chain, agent-id)
  assert.deepEqual(v2.agent, v1.agent);
  // revocation procedure unchanged
  assert.deepEqual(v2.revocation, v1.revocation);
  // kernel-wallet inside active-session-key carries forward
  assert.equal(v2["active-session-key"]?.["kernel-wallet"], v1["active-session-key"]?.["kernel-wallet"]);
});

test("bumpPolicy — input doc is NOT mutated (deep clone semantics)", () => {
  const v1 = loadV1();
  const before = JSON.stringify(v1);
  bumpPolicy(v1, {
    newVersion: "v2",
    newSessionKeyAddress: NEW_KEY,
    issuedAt: FIXED_TIMESTAMP,
  });
  assert.equal(JSON.stringify(v1), before);
});

test("bumpPolicy — same inputs produce byte-identical JCS canonical output (purity test, Codex amendment 4)", () => {
  // The function claims to be pure. Two calls with the same inputs
  // must produce the same canonical bytes. Catches accidental Date.now()
  // leaks at module-eval time, or hidden randomness.
  const v1 = loadV1();
  const a = bumpPolicy(v1, {
    newVersion: "v2",
    newSessionKeyAddress: NEW_KEY,
    issuedAt: FIXED_TIMESTAMP,
    newTtlHours: 24,
  });
  const b = bumpPolicy(v1, {
    newVersion: "v2",
    newSessionKeyAddress: NEW_KEY,
    issuedAt: FIXED_TIMESTAMP,
    newTtlHours: 24,
  });
  assert.equal(
    keccak256(toHex(canonicalizeBytes(a as never))),
    keccak256(toHex(canonicalizeBytes(b as never))),
  );
});

test("bumpPolicy — newTtlHours overrides the carried-forward ttl", () => {
  const v1 = loadV1();
  const v2 = bumpPolicy(v1, {
    newVersion: "v2",
    newSessionKeyAddress: NEW_KEY,
    issuedAt: FIXED_TIMESTAMP,
    newTtlHours: 24,
  });
  assert.equal(v2["active-session-key"]?.["ttl-hours"], 24);
});

test("bumpPolicy — carries forward ttl when newTtlHours not provided", () => {
  const v1 = loadV1();
  const originalTtl = v1["active-session-key"]?.["ttl-hours"];
  assert.ok(typeof originalTtl === "number", "fixture must have a ttl");
  const v2 = bumpPolicy(v1, {
    newVersion: "v2",
    newSessionKeyAddress: NEW_KEY,
    issuedAt: FIXED_TIMESTAMP,
  });
  assert.equal(v2["active-session-key"]?.["ttl-hours"], originalTtl);
});

test("bumpPolicy — bumps $id suffix when it ends in -vN.json", () => {
  const v1 = loadV1();
  // v1 fixture's $id is "https://emilemarcelagustin.eth.limo/policies/delegation-policy-v1.json"
  assert.match(v1.$id ?? "", /-v1\.json$/);
  const v2 = bumpPolicy(v1, {
    newVersion: "v2",
    newSessionKeyAddress: NEW_KEY,
    issuedAt: FIXED_TIMESTAMP,
  });
  assert.match(v2.$id ?? "", /-v2\.json$/);
});

test("bumpPolicy — rejects invalid newVersion", () => {
  const v1 = loadV1();
  assert.throws(
    () =>
      bumpPolicy(v1, { newVersion: "2", newSessionKeyAddress: NEW_KEY, issuedAt: FIXED_TIMESTAMP }),
    /invalid newVersion/,
  );
});

test("bumpPolicy — rejects docs without active-session-key", () => {
  const broken = { version: "v1" } as PolicyDoc;
  assert.throws(
    () =>
      bumpPolicy(broken, {
        newVersion: "v2",
        newSessionKeyAddress: NEW_KEY,
        issuedAt: FIXED_TIMESTAMP,
      }),
    /lacks "active-session-key"/,
  );
});

test("nextMajorVersion — v1 → v2, v2 → v3, v1.2 → v2", () => {
  assert.equal(nextMajorVersion("v1"), "v2");
  assert.equal(nextMajorVersion("v2"), "v3");
  assert.equal(nextMajorVersion("v1.2"), "v2");
  assert.equal(nextMajorVersion("v9"), "v10");
});

test("nextMajorVersion — rejects malformed versions", () => {
  assert.throws(() => nextMajorVersion("1"), /invalid current version/);
  assert.throws(() => nextMajorVersion("v"), /invalid current version/);
  assert.throws(() => nextMajorVersion("Va1"), /invalid current version/);
});
