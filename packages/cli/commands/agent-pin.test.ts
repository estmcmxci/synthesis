import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentPin } from "./agent-pin";

const FAKE_CID = "bafybeicqnxyjsvro7ipmdhhzymtk5y2qbaudzmtgggllt7midikdxkmoxi";

/**
 * The CLI presenter calls into @synthesis/resolver's pinDirectory which
 * uses globalThis.fetch. To test offline we monkey-patch globalThis.fetch
 * for the duration of the test (and restore after).
 */
async function withMockedFetch<T>(
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
    responder(typeof input === "string" ? input : input.toString(), init)) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function makeTmpDir(layout: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-pin-test-"));
  for (const [relpath, content] of Object.entries(layout)) {
    const full = join(dir, relpath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const POLICY_JSON = JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.com/policies/p.json",
  hello: "world",
});

function withEnv<T>(key: string, value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  return fn().finally(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });
}

test("agentPin — happy path: pins a 2-file dir, returns ipfs URIs rooted at the CID", async () => {
  const dir = makeTmpDir({
    "README.md": "hi",
    "policies/p.json": POLICY_JSON,
  });
  try {
    const result = await withEnv("PINATA_JWT", "TEST_JWT", () =>
      withMockedFetch(
        (url) => {
          if (url === "https://api.pinata.cloud/pinning/pinFileToIPFS") {
            return new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 });
          }
          // verify probe
          return new Response("ok", { status: 200 });
        },
        () => agentPin({ dir, format: "json" }),
      ),
    );
    assert.equal(result.cid, FAKE_CID);
    assert.equal(result.files.length, 2);
    assert.ok(result.files.some((f) => f.relpath === "README.md"));
    assert.ok(result.files.some((f) => f.relpath === "policies/p.json"));
    assert.equal(result.verified, true);
    assert.equal(result.policyHash, undefined);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("agentPin --policy <relpath> — computes policyHash via the resolver's JCS path", async () => {
  const dir = makeTmpDir({
    "README.md": "hi",
    "policies/p.json": POLICY_JSON,
  });
  try {
    const result = await withEnv("PINATA_JWT", "TEST_JWT", () =>
      withMockedFetch(
        (url) =>
          url.includes("pinFileToIPFS")
            ? new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 })
            : new Response("ok", { status: 200 }),
        () => agentPin({ dir, policy: "policies/p.json", format: "json" }),
      ),
    );
    assert.match(result.policyHash ?? "", /^0x[0-9a-f]{64}$/);
    assert.equal(result.policyRelpath, "policies/p.json");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("agentPin --policy <relpath-not-in-dir> — exits 2 before any Pinata call", async () => {
  const dir = makeTmpDir({
    "README.md": "hi",
    "policies/p.json": POLICY_JSON,
  });
  try {
    let pinataCalled = false;
    await assert.rejects(
      () =>
        withEnv("PINATA_JWT", "TEST_JWT", () =>
          withMockedFetch(
            () => {
              pinataCalled = true;
              return new Response("{}", { status: 200 });
            },
            () => agentPin({ dir, policy: "does-not-exist.json", format: "json" }),
          ),
        ),
      /not found inside/,
    );
    assert.equal(pinataCalled, false);
    assert.equal(process.exitCode, 2);
    process.exitCode = 0;
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("agentPin without PINATA_JWT — exits 2 with a clear message", async () => {
  const dir = makeTmpDir({ "a.json": "{}", "b.json": "{}" });
  try {
    await assert.rejects(
      () =>
        withEnv("PINATA_JWT", undefined, () => agentPin({ dir, format: "json" })),
      /PINATA_JWT/,
    );
    assert.equal(process.exitCode, 2);
    process.exitCode = 0;
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("agentPin with single-file dir — exits 2 (Pinata flattens)", async () => {
  const dir = makeTmpDir({ "only.json": "{}" });
  try {
    await assert.rejects(
      () =>
        withEnv("PINATA_JWT", "TEST_JWT", () =>
          agentPin({ dir, format: "json" }),
        ),
      /at least 2 files/,
    );
    assert.equal(process.exitCode, 2);
    process.exitCode = 0;
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("agentPin --no-verify — skips the gateway probe, sets verified=true (probe-skipped semantics)", async () => {
  const dir = makeTmpDir({ "a.json": "{}", "b.json": "{}" });
  try {
    let probeHit = false;
    const result = await withEnv("PINATA_JWT", "TEST_JWT", () =>
      withMockedFetch(
        (url) => {
          if (url.includes("pinFileToIPFS")) {
            return new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 });
          }
          probeHit = true;
          return new Response("ok", { status: 200 });
        },
        () => agentPin({ dir, noVerify: true, format: "json" }),
      ),
    );
    assert.equal(probeHit, false);
    assert.equal(result.verified, true);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("INTEGRATION pin → verify round-trip on a throwaway dir (gated on INTEGRATION_TESTS=1)", async () => {
  // Round-trip the JCS + keccak path against real Pinata. Pin a tmpdir
  // containing a small policy doc, then re-fetch from the resulting CID
  // via fetchIpfsRaw and assert keccak256(JCS(fetched)) == policyHash
  // returned by `agent pin`. A bug in either side surfaces here.
  if (!process.env.INTEGRATION_TESTS || !process.env.PINATA_JWT) return;
  const { fetchIpfsRaw, canonicalizeBytes } = await import("@synthesis/resolver");
  const { keccak256, toHex } = await import("viem");

  const dir = makeTmpDir({
    "README.md": "integration-test pin",
    "policies/p.json": POLICY_JSON,
  });
  try {
    const result = await agentPin({
      dir,
      policy: "policies/p.json",
      format: "json",
    });
    assert.match(result.policyHash ?? "", /^0x[0-9a-f]{64}$/);
    // Pull the policy back from IPFS via the same gateway race the verifier
    // uses, then recompute the hash from those bytes.
    const fetched = await fetchIpfsRaw(`ipfs://${result.cid}/policies/p.json`);
    const obj = JSON.parse(new TextDecoder().decode(fetched.bytes));
    const recomputed = keccak256(toHex(canonicalizeBytes(obj)));
    assert.equal(recomputed, result.policyHash);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("agentPin verify probe fails — exit code 1, error surfaces in JSON output", async () => {
  const dir = makeTmpDir({ "a.json": "{}", "b.json": "{}" });
  try {
    await assert.rejects(
      () =>
        withEnv("PINATA_JWT", "TEST_JWT", () =>
          withMockedFetch(
            (url) =>
              url.includes("pinFileToIPFS")
                ? new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 })
                : new Response("not found", { status: 404 }),
            () => agentPin({ dir, format: "json" }),
          ),
        ),
      /gateway probe failed/,
    );
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  } finally {
    rmSync(dir, { recursive: true });
  }
});
