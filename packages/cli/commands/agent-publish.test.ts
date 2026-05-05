import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRecords } from "./agent-publish";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_OPTS = {
  name: "emilemarcelagustin.eth",
  schema: "ipfs://bafy.../schemas/agent-schema-v1.json",
  runtimePubkey: "0x8973B6897554017d208DBeE2Ef5Fb8Fb046A6aEB",
  runtimeStatus: "active",
  kernelWallet: "0xEc0d3C782C6087235Ab16d8c4d4188d10DFD796A",
  agentEndpointWeb: "https://x.example.com/app",
  delegation: "ipfs://bafy.../policies/p.json",
  policyHash: "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
  policyVersion: "v1",
};

function writeJson(content: object): string {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  const path = join(dir, "pin.json");
  writeFileSync(path, JSON.stringify(content));
  return path;
}

test("resolveRecords — explicit flags fully populate the record set", () => {
  const { records, missingFromPin } = resolveRecords(VALID_OPTS, {});
  assert.equal(missingFromPin.length, 0);
  assert.equal(records.schema, VALID_OPTS.schema);
  assert.equal(records["runtime-pubkey"], VALID_OPTS.runtimePubkey);
  assert.equal(records.delegation, VALID_OPTS.delegation);
  assert.equal(records["policy-hash"], VALID_OPTS.policyHash);
});

test("resolveRecords — class defaults to Agent", () => {
  const { records } = resolveRecords(VALID_OPTS, {});
  assert.equal(records.class, "Agent");
});

test("resolveRecords — runtimeStatus defaults to active", () => {
  const opts = { ...VALID_OPTS };
  delete (opts as Partial<typeof opts>).runtimeStatus;
  const { records } = resolveRecords(opts, {});
  assert.equal(records["runtime-status"], "active");
});

test("resolveRecords — pin-output schemaUri/delegationUri/policyHash populate corresponding fields", () => {
  const minimal = {
    name: "x.eth",
    runtimePubkey: VALID_OPTS.runtimePubkey,
    kernelWallet: VALID_OPTS.kernelWallet,
    agentEndpointWeb: VALID_OPTS.agentEndpointWeb,
    fromPinOutput: ["fake.json"],
  };
  const pin = {
    schemaUri: "ipfs://A/schemas/agent-schema-v1.json",
    delegationUri: "ipfs://A/policies/p.json",
    policyHash: "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
  };
  const { records, missingFromPin } = resolveRecords(minimal, pin);
  assert.equal(missingFromPin.length, 0);
  assert.equal(records.schema, pin.schemaUri);
  assert.equal(records.delegation, pin.delegationUri);
  assert.equal(records["policy-hash"], pin.policyHash);
});

test("resolveRecords — explicit --schema overrides pin schemaUri", () => {
  const opts = { ...VALID_OPTS, schema: "ipfs://OVERRIDE/x.json", fromPinOutput: ["fake.json"] };
  const pin = { schemaUri: "ipfs://from-pin/x.json" };
  const { records } = resolveRecords(opts, pin);
  assert.equal(records.schema, "ipfs://OVERRIDE/x.json");
});

test("resolveRecords — fail-loud when --from-pin-output is set but schemaUri is absent and --schema not provided", () => {
  const opts = {
    name: "x.eth",
    runtimePubkey: VALID_OPTS.runtimePubkey,
    kernelWallet: VALID_OPTS.kernelWallet,
    agentEndpointWeb: VALID_OPTS.agentEndpointWeb,
    fromPinOutput: ["fake.json"],
  };
  // pin output has policyHash but no schemaUri or delegationUri
  const pin = { policyHash: "0xabc" };
  const { missingFromPin } = resolveRecords(opts, pin);
  assert.ok(missingFromPin.some((m) => /schemaUri/.test(m)));
  assert.ok(missingFromPin.some((m) => /delegationUri/.test(m)));
});

test("resolveRecords — fail-loud on missing delegationUri even when --policy-hash is supplied (Codex P1)", () => {
  // Earlier version of the gate skipped this check when --policy-hash
  // was passed, letting an operator publish policy-hash without any
  // delegation URI. Now the gate keys off pin's missing delegationUri
  // + the absence of --delegation, regardless of --policy-hash.
  const opts = {
    name: "x.eth",
    runtimePubkey: VALID_OPTS.runtimePubkey,
    kernelWallet: VALID_OPTS.kernelWallet,
    agentEndpointWeb: VALID_OPTS.agentEndpointWeb,
    fromPinOutput: ["fake.json"],
    // operator passed --policy-hash explicitly, but no --delegation
    policyHash: "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
    schema: VALID_OPTS.schema, // explicit schema so schemaUri check is satisfied
  };
  // pin output has a policyHash but no delegationUri (the --policy - case)
  const pin = {
    policyHash: "0xabc...",
  };
  const { missingFromPin } = resolveRecords(opts, pin);
  assert.ok(
    missingFromPin.some((m) => /delegationUri/.test(m)),
    "must fail-loud on missing delegationUri even when --policy-hash is set",
  );
});

test("resolveRecords — fail-loud is OFF when --from-pin-output is not set (no missing-field complaints)", () => {
  // Caller passes everything explicitly; no pin-output; no fail-loud.
  const { missingFromPin } = resolveRecords(VALID_OPTS, {});
  assert.equal(missingFromPin.length, 0);
});

test("--from-pin-output — lenient parser tolerates the incur double-emit (two concatenated JSON objects)", async () => {
  // The CLI's mergePinOutputs is private; exercise it through a temp file
  // and resolveRecords via fromPinOutput. Construct a file containing two
  // JSON objects (mirrors what `pin --format json > file.json` actually
  // produces because incur auto-prints the run() return value).
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  const path = join(dir, "double.json");
  const obj1 = {
    cid: "bafyA",
    schemaUri: "ipfs://A/schemas/agent-schema-v1.json",
    delegationUri: "ipfs://A/policies/p.json",
    policyHash: "0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114",
  };
  // simulate incur's auto-emit by appending a second object
  writeFileSync(path, JSON.stringify(obj1, null, 2) + "\n" + JSON.stringify(obj1));
  try {
    // Import the agentPublish module fresh so its private parser runs.
    const { agentPublish } = await import("./agent-publish");
    // We can't easily run the full publish without a viem mock. Instead
    // exercise the parse path indirectly: pass --from-pin-output and
    // expect the resolver lookup to fail (since this is a fake name) with
    // a message that proves merging happened.
    await assert.rejects(
      () =>
        agentPublish({
          name: "this-name-doesnt-exist-anywhere.eth",
          fromPinOutput: [path],
          runtimePubkey: "0x8973B6897554017d208DBeE2Ef5Fb8Fb046A6aEB",
          kernelWallet: "0xEc0d3C782C6087235Ab16d8c4d4188d10DFD796A",
          agentEndpointWeb: "https://x.example.com/app",
          policyVersion: "v1",
          format: "json",
        }),
      // Either resolver-not-found OR validation passes — both prove the
      // pin-output parsed successfully (the alternative would be a JSON
      // parse error from the double-emit).
      /No resolver found|validation/,
    );
    process.exitCode = 0;
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("agent-publish — index.ts schema does not declare --dry-run (broadcast is the only opt-in)", () => {
  // Regression fence: the incur schema for `agent publish` must not have
  // a `dryRun` option. Absence of --broadcast is the only "don't send"
  // signal (per the amendment on #50). Read the schema source directly.
  const idx = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
  // Pull out the publish subcommand's options block
  const publishStart = idx.indexOf('agent.command("publish"');
  assert.ok(publishStart >= 0, 'agent.command("publish") must be registered');
  const publishEnd = idx.indexOf("cli.command(agent)", publishStart);
  const slice = idx.slice(publishStart, publishEnd);
  assert.ok(/broadcast: z/.test(slice), "publish must declare a broadcast option");
  assert.ok(!/dryRun: z|"--dry-run"/.test(slice), "publish must NOT declare a dryRun option");
});
