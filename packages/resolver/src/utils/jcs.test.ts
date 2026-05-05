import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { keccak256, toHex } from "viem";
import { canonicalize, canonicalizeBytes } from "./jcs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, "../../test/fixtures/agent-verify");

test("canonicalize sorts object keys", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalize({ z: { y: 1, x: 2 }, a: 3 }), '{"a":3,"z":{"x":2,"y":1}}');
});

test("canonicalize preserves array order", () => {
  assert.equal(canonicalize([3, 1, 2]), "[3,1,2]");
  assert.equal(canonicalize([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
});

test("canonicalize emits no whitespace", () => {
  const input = { hello: "world", n: 42, arr: [1, true, null] };
  const out = canonicalize(input);
  assert.ok(!/\s/.test(out), "output must contain no whitespace");
});

test("canonicalize handles primitives", () => {
  assert.equal(canonicalize(null), "null");
  assert.equal(canonicalize(true), "true");
  assert.equal(canonicalize(false), "false");
  assert.equal(canonicalize(0), "0");
  assert.equal(canonicalize(-1.5), "-1.5");
  assert.equal(canonicalize("hello"), '"hello"');
});

test("canonicalize escapes strings via JSON.stringify rules", () => {
  assert.equal(canonicalize('a"b'), '"a\\"b"');
  assert.equal(canonicalize("line\nbreak"), '"line\\nbreak"');
});

test("canonicalize rejects non-finite numbers", () => {
  assert.throws(() => canonicalize(Number.NaN), /non-finite/);
  assert.throws(() => canonicalize(Number.POSITIVE_INFINITY), /non-finite/);
});

test("canonicalize rejects -0", () => {
  assert.throws(() => canonicalize(-0), /-0/);
});

test("canonicalize is whitespace-insensitive on input but byte-deterministic on output", () => {
  const a = JSON.parse('{"b":1,  "a"  :  2}');
  const b = JSON.parse('{ "a":2,"b":1 }');
  assert.equal(canonicalize(a), canonicalize(b));
});

test("RFC 8785 §3.2.3 — keys sorted by UTF-16 code-unit order", () => {
  // RFC 8785 Appendix B: keys with non-ASCII code points sort by code-unit
  // order, which JS Array.prototype.sort over strings does by default.
  assert.equal(canonicalize({ "é": 1, e: 2 }), '{"e":2,"é":1}');
});

test("frozen policy doc canonicalizes to the published keccak256 hash", () => {
  const path = resolve(FIXTURE_DIR, "delegation-policy-v1.json");
  const raw = readFileSync(path, "utf8");
  const obj = JSON.parse(raw);
  const bytes = canonicalizeBytes(obj);
  const hash = keccak256(toHex(bytes));
  assert.equal(
    hash,
    "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
    "JCS impl is incorrect — canonical-bytes hash diverges from the on-chain policy-hash record",
  );
});
