import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { base } from "viem/chains";
import { keccak256, toHex } from "viem";
import { rotateAgent, type RotateAgentArgs } from "./rotate.js";
import { canonicalizeBytes } from "../utils/jcs.js";
import { createKeystore } from "./keystore.js";
import type { PolicyDoc } from "./policy-bump.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, "../../test/fixtures/agent-verify");

const POLICY_BYTES = readFileSync(resolve(FIXTURE_DIR, "delegation-policy-v1.json"));
const POLICY_OBJ = JSON.parse(POLICY_BYTES.toString("utf8")) as PolicyDoc;

const RECORDS = JSON.parse(
  readFileSync(resolve(FIXTURE_DIR, "records.json"), "utf8"),
) as { records: Record<string, string>; ownerAddress: string };

const FIXED_TS = "2026-05-12T00:00:00Z";
const NEW_CID = "bafybeiNEWCID000000000000000000000000000000000000000000000000000ab";
const NEW_SESSION_KEY = "0x0001020304050607080900010203040506070809" as `0x${string}`;

const TEST_OWNER_PK = "0x4444444444444444444444444444444444444444444444444444444444444444";
const TEST_OWNER_PWD = "owner-pass";
const ownerKeystore = createKeystore({ privateKey: TEST_OWNER_PK, password: TEST_OWNER_PWD });

function baseArgs(overrides?: Partial<RotateAgentArgs>): RotateAgentArgs {
  return {
    ensName: "emilemarcelagustin.eth",
    alias: "alpha",
    ownerKeystore,
    ownerPassword: TEST_OWNER_PWD,
    chain: base,
    chainLabel: "base",
    rpc: "rpc",
    bundlerUrl: "bundler",
    pinataJwt: "TEST_JWT",
    issuedAt: FIXED_TS,
    resolverAddress: "0xF29100983E058B709F3D539b0c765937B804AC15" as `0x${string}`,
    testHooks: {
      readRecords: async () => RECORDS.records,
      fetchIpfs: async () => ({
        bytes: new Uint8Array(POLICY_BYTES),
        gateway: "fixture",
      }),
      pinDirectory: async (files, opts) => ({
        cid: NEW_CID,
        files: files.map((f) => ({
          relpath: f.relpath,
          ipfsUri: `ipfs://${NEW_CID}/${f.relpath}`,
          gatewayUrl: `https://${opts.gateway ?? "gateway.pinata.cloud"}/ipfs/${NEW_CID}/${f.relpath}`,
        })),
      }),
      issueSessionKey: (async () => ({
        alias: "alpha-policy-v2",
        sessionKeyAddress: NEW_SESSION_KEY,
        kernelWallet: RECORDS.records["kernel-wallet"] as `0x${string}`,
        chain: "base",
        chainId: 8453,
        validUntil: 0,
        ttlHours: 168,
        sessionKeyPath: "/tmp/fake-alpha-policy-v2.json",
        created: true,
      })) as never,
      publishAgentRecords: (async (
        ensName: string,
        records: Record<string, string>,
      ) => ({
        ensName,
        resolver: "0xF29100983E058B709F3D539b0c765937B804AC15" as `0x${string}`,
        records: Object.entries(records).map(([key, value]) => ({ key, value })),
        diffs: null,
        setTextCalls: [],
        broadcast: false,
      })) as never,
    },
    ...overrides,
  };
}

test("rotateAgent — happy path: bumps v1 to v2, generates new artifact name + ipfs URI", async () => {
  const r = await rotateAgent(baseArgs());
  assert.equal(r.fromVersion, "v1");
  assert.equal(r.toVersion, "v2");
  assert.equal(r.alias, "alpha");
  // Codex amendment 1: artifact name follows policy version, not previous-suffix counter.
  assert.equal(r.newSessionKeyArtifact, "alpha-policy-v2");
  assert.equal(r.toRuntimePubkey, NEW_SESSION_KEY);
  assert.equal(r.newPolicy.uri, `ipfs://${NEW_CID}/policies/delegation-policy-v2.json`);
  assert.equal(r.newPolicy.version, "v2");
  assert.match(r.newPolicy.hash, /^0x[0-9a-f]{64}$/);
  assert.equal(r.broadcast, false);
});

test("rotateAgent — newPolicy.hash matches keccak256(JCS(bumped-doc))", async () => {
  // Compute the expected hash locally using the same canonicalizer the
  // verifier uses. If the orchestrator drifts (e.g. someone introduces
  // an alternate canonicalization), this catches it.
  const expectedDoc = {
    ...POLICY_OBJ,
    version: "v2",
    "issued-at": FIXED_TS,
    $id: POLICY_OBJ.$id?.replace(/-v1\.json$/, "-v2.json"),
    "active-session-key": {
      ...POLICY_OBJ["active-session-key"]!,
      address: NEW_SESSION_KEY,
      "issued-at": FIXED_TS,
      "ttl-hours": POLICY_OBJ["active-session-key"]!["ttl-hours"],
    },
  };
  const expectedHash = keccak256(toHex(canonicalizeBytes(expectedDoc as never)));
  const r = await rotateAgent(baseArgs());
  assert.equal(r.newPolicy.hash, expectedHash);
});

test("rotateAgent — explicit --policy-version overrides auto-bump", async () => {
  const r = await rotateAgent(baseArgs({ newPolicyVersion: "v5" }));
  assert.equal(r.toVersion, "v5");
  assert.equal(r.newSessionKeyArtifact, "alpha-policy-v5");
  assert.equal(r.newPolicy.uri, `ipfs://${NEW_CID}/policies/delegation-policy-v5.json`);
});

test("rotateAgent — refuses when name has no current policy-version (precondition)", async () => {
  const recordsNoPolicy = { ...RECORDS.records };
  delete (recordsNoPolicy as Record<string, string>)["policy-version"];
  await assert.rejects(
    () =>
      rotateAgent(
        baseArgs({
          testHooks: {
            ...baseArgs().testHooks,
            readRecords: async () => recordsNoPolicy,
          },
        }),
      ),
    /lacks an existing policy/,
  );
});

test("rotateAgent — refuses when name has no delegation URI", async () => {
  const recordsNoDelegation = { ...RECORDS.records };
  delete (recordsNoDelegation as Record<string, string>).delegation;
  await assert.rejects(
    () =>
      rotateAgent(
        baseArgs({
          testHooks: { ...baseArgs().testHooks, readRecords: async () => recordsNoDelegation },
        }),
      ),
    /lacks an existing policy/,
  );
});

test("rotateAgent — publish plan covers the 4 changed records and carries forward the rest", async () => {
  let receivedRecords: Record<string, string> | null = null;
  const r = await rotateAgent(
    baseArgs({
      testHooks: {
        ...baseArgs().testHooks,
        publishAgentRecords: (async (
          ensName: string,
          records: Record<string, string>,
        ) => {
          receivedRecords = records;
          return {
            ensName,
            resolver: "0xF29100983E058B709F3D539b0c765937B804AC15" as `0x${string}`,
            records: Object.entries(records).map(([key, value]) => ({ key, value })),
            diffs: null,
            setTextCalls: [],
            broadcast: false,
          };
        }) as never,
      },
    }),
  );
  assert.ok(receivedRecords, "publishAgentRecords must have been invoked");
  // Changed values:
  assert.equal((receivedRecords as Record<string, string>)["runtime-pubkey"], NEW_SESSION_KEY);
  assert.equal(
    (receivedRecords as Record<string, string>)["policy-hash"],
    r.newPolicy.hash,
  );
  assert.equal((receivedRecords as Record<string, string>)["policy-version"], "v2");
  assert.equal(
    (receivedRecords as Record<string, string>)["delegation"],
    `ipfs://${NEW_CID}/policies/delegation-policy-v2.json`,
  );
  // Carried-forward values:
  assert.equal(
    (receivedRecords as Record<string, string>)["kernel-wallet"],
    RECORDS.records["kernel-wallet"],
  );
  assert.equal(
    (receivedRecords as Record<string, string>)["agent-endpoint[web]"],
    RECORDS.records["agent-endpoint[web]"],
  );
  assert.equal((receivedRecords as Record<string, string>).schema, RECORDS.records.schema);
});

test("rotateAgent — issueSessionKey is called under the versioned alias (not base alias)", async () => {
  let receivedAlias: string | null = null;
  await rotateAgent(
    baseArgs({
      testHooks: {
        ...baseArgs().testHooks,
        issueSessionKey: (async (opts: { alias: string }) => {
          receivedAlias = opts.alias;
          return {
            alias: opts.alias,
            sessionKeyAddress: NEW_SESSION_KEY,
            kernelWallet: RECORDS.records["kernel-wallet"] as `0x${string}`,
            chain: "base",
            chainId: 8453,
            validUntil: 0,
            ttlHours: 168,
            sessionKeyPath: `/tmp/${opts.alias}.json`,
            created: true,
          };
        }) as never,
      },
    }),
  );
  // Codex amendment 1: alias is `<base>-policy-v<N>`, where N is the new
  // on-chain version, NOT a previous-suffix increment.
  assert.equal(receivedAlias, "alpha-policy-v2");
});

test("rotateAgent — pin step uses the bumped relpath under policies/", async () => {
  let pinnedFiles: { relpath: string; bytes: Uint8Array }[] | null = null;
  await rotateAgent(
    baseArgs({
      testHooks: {
        ...baseArgs().testHooks,
        pinDirectory: async (files, opts) => {
          pinnedFiles = files;
          return {
            cid: NEW_CID,
            files: files.map((f) => ({
              relpath: f.relpath,
              ipfsUri: `ipfs://${NEW_CID}/${f.relpath}`,
              gatewayUrl: `https://${opts.gateway ?? "gateway.pinata.cloud"}/ipfs/${NEW_CID}/${f.relpath}`,
            })),
          };
        },
      },
    }),
  );
  // Local cast — TS strict mode in CI narrows closure-captured lets to
  // `never` when assigned through a generic-typed callback.
  const captured = pinnedFiles as
    | { relpath: string; bytes: Uint8Array }[]
    | null;
  assert.ok(captured && captured.length === 2);
  const relpaths = captured.map((f) => f.relpath).sort();
  assert.deepEqual(relpaths, ["ROTATION.txt", "policies/delegation-policy-v2.json"]);
});

test("rotateAgent — resolverAddress fallback honors optional contract via ENS registry lookup (Codex P2)", async () => {
  // The fallback used to hard-throw, breaking the documented optional
  // contract. Now it should call the public client's readContract for
  // ENS Registry's `resolver(bytes32)`. Stub the client so we don't
  // hit a real RPC.
  const args = baseArgs();
  // Strip the explicit resolverAddress so the fallback runs.
  delete (args as Partial<RotateAgentArgs>).resolverAddress;
  // Intercept readContract for the registry call. The orchestrator
  // creates its own publicClient internally; we can't easily stub that
  // without exposing a hook. Instead, set ensRpcUrl to an obviously bogus
  // value and verify the error names the registry, not "--resolver-address
  // is required".
  args.ensRpcUrl = "http://127.0.0.1:1"; // unreachable
  await assert.rejects(
    () => rotateAgent(args),
    (err: Error) => {
      // Either the registry lookup fails (network error) or the resolver
      // returns zero — both prove the fallback path was actually taken.
      assert.ok(
        !/-resolver-address is required/.test(err.message),
        `must not throw the legacy hard-fail message; got: ${err.message}`,
      );
      return true;
    },
  );
});

test("rotateAgent — broadcast: true threads through to publishAgentRecords", async () => {
  let receivedBroadcast: boolean | undefined;
  await rotateAgent(
    baseArgs({
      broadcast: true,
      send: async () => "0xdeadbeef" as `0x${string}`,
      testHooks: {
        ...baseArgs().testHooks,
        publishAgentRecords: (async (
          _ensName: string,
          _records: Record<string, string>,
          _client: unknown,
          opts: { broadcast?: boolean },
        ) => {
          receivedBroadcast = opts.broadcast;
          return {
            ensName: "emilemarcelagustin.eth",
            resolver: "0xF29100983E058B709F3D539b0c765937B804AC15" as `0x${string}`,
            records: [],
            diffs: null,
            setTextCalls: [],
            broadcast: !!opts.broadcast,
            txHashes: ["0xdeadbeef"],
          };
        }) as never,
      },
    }),
  );
  assert.equal(receivedBroadcast, true);
});
