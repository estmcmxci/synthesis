import { test } from "node:test";
import assert from "node:assert/strict";
import { pinDirectory, verifyPinResolves } from "./pinata.js";

const FAKE_CID = "bafybeicqnxyjsvro7ipmdhhzymtk5y2qbaudzmtgggllt7midikdxkmoxi";

interface CapturedRequest {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  formEntries: { name: string; value: unknown; filename?: string }[];
}

async function captureRequest(
  responder: (req: CapturedRequest) => Response | Promise<Response>,
): Promise<{ fetchMock: typeof fetch; captured: CapturedRequest[] }> {
  const captured: CapturedRequest[] = [];
  const fetchMock: typeof fetch = async (input: RequestInfo | URL, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const k of Object.keys(h)) headers[k.toLowerCase()] = h[k];
    }
    const formEntries: CapturedRequest["formEntries"] = [];
    if (init?.body instanceof FormData) {
      // FormData iteration: the standard exposes [Symbol.iterator] yielding
      // [name, value] tuples but lib.dom.d.ts in some TS targets omits
      // .entries(). Cast through the iterable shape to stay portable.
      const iterable = init.body as unknown as Iterable<[string, FormDataEntryValue]>;
      for (const [name, value] of iterable) {
        if (value instanceof File) {
          formEntries.push({ name, value: await value.arrayBuffer(), filename: value.name });
        } else {
          formEntries.push({ name, value });
        }
      }
    }
    const req: CapturedRequest = { url, method: init?.method, headers, formEntries };
    captured.push(req);
    return responder(req);
  };
  return { fetchMock, captured };
}

test("pinDirectory POSTs multipart form to pinFileToIPFS with bearer auth", async () => {
  const { fetchMock, captured } = await captureRequest(
    () =>
      new Response(JSON.stringify({ IpfsHash: FAKE_CID, PinSize: 1, Timestamp: "now" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  await pinDirectory(
    [
      { relpath: "README.md", bytes: new TextEncoder().encode("hi") },
      { relpath: "schemas/agent-schema-v1.json", bytes: new TextEncoder().encode("{}") },
    ],
    { jwt: "JWT_TOKEN", fetch: fetchMock },
  );
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, "https://api.pinata.cloud/pinning/pinFileToIPFS");
  assert.equal(captured[0].method, "POST");
  assert.equal(captured[0].headers.authorization, "Bearer JWT_TOKEN");
});

test("pinDirectory applies pin-root/ synthetic prefix to every file (Pinata directory-shape requirement)", async () => {
  const { fetchMock, captured } = await captureRequest(
    () => new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 }),
  );
  await pinDirectory(
    [
      { relpath: "README.md", bytes: new Uint8Array() },
      { relpath: "schemas/agent-schema-v1.json", bytes: new Uint8Array() },
      { relpath: "policies/delegation-policy-v1.json", bytes: new Uint8Array() },
    ],
    { jwt: "X", fetch: fetchMock },
  );
  const fileEntries = captured[0].formEntries.filter((e) => e.name === "file");
  assert.equal(fileEntries.length, 3);
  // Without the synthetic prefix, Pinata strips path components and
  // collapses the upload to a flat list — these assertions detect that
  // regression.
  assert.equal(fileEntries[0].filename, "pin-root/README.md");
  assert.equal(fileEntries[1].filename, "pin-root/schemas/agent-schema-v1.json");
  assert.equal(fileEntries[2].filename, "pin-root/policies/delegation-policy-v1.json");
});

test("pinDirectory passes pinataOptions cidVersion=1 (modern bafy... CIDs)", async () => {
  const { fetchMock, captured } = await captureRequest(
    () => new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 }),
  );
  await pinDirectory(
    [
      { relpath: "a.json", bytes: new Uint8Array() },
      { relpath: "b.json", bytes: new Uint8Array() },
    ],
    { jwt: "X", fetch: fetchMock },
  );
  const opts = captured[0].formEntries.find((e) => e.name === "pinataOptions");
  assert.ok(opts);
  assert.deepEqual(JSON.parse(opts.value as string), { cidVersion: 1 });
});

test("pinDirectory uses caller's metadataName (no timestamp surprise)", async () => {
  const { fetchMock, captured } = await captureRequest(
    () => new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 }),
  );
  await pinDirectory(
    [
      { relpath: "a.json", bytes: new Uint8Array() },
      { relpath: "b.json", bytes: new Uint8Array() },
    ],
    { jwt: "X", metadataName: "agent-policy-v1", fetch: fetchMock },
  );
  const meta = captured[0].formEntries.find((e) => e.name === "pinataMetadata");
  assert.deepEqual(JSON.parse(meta!.value as string), { name: "agent-policy-v1" });
});

test("pinDirectory returns ipfs:// + gateway URLs rooted at the returned CID", async () => {
  const { fetchMock } = await captureRequest(
    () => new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 }),
  );
  const result = await pinDirectory(
    [
      { relpath: "schemas/agent-schema-v1.json", bytes: new Uint8Array() },
      { relpath: "policies/delegation-policy-v1.json", bytes: new Uint8Array() },
    ],
    { jwt: "X", fetch: fetchMock },
  );
  assert.equal(result.cid, FAKE_CID);
  assert.equal(
    result.files[0].ipfsUri,
    `ipfs://${FAKE_CID}/schemas/agent-schema-v1.json`,
  );
  assert.equal(
    result.files[0].gatewayUrl,
    `https://gateway.pinata.cloud/ipfs/${FAKE_CID}/schemas/agent-schema-v1.json`,
  );
});

test("pinDirectory honors a custom gateway for the returned URLs", async () => {
  const { fetchMock } = await captureRequest(
    () => new Response(JSON.stringify({ IpfsHash: FAKE_CID }), { status: 200 }),
  );
  const result = await pinDirectory(
    [
      { relpath: "a.json", bytes: new Uint8Array() },
      { relpath: "b.json", bytes: new Uint8Array() },
    ],
    { jwt: "X", gateway: "my-gw.pinata.cloud", fetch: fetchMock },
  );
  assert.ok(result.files[0].gatewayUrl.startsWith("https://my-gw.pinata.cloud/ipfs/"));
});

test("pinDirectory throws on Pinata 4xx with status + body excerpt", async () => {
  const { fetchMock } = await captureRequest(
    () =>
      new Response(JSON.stringify({ error: "invalid auth" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  );
  await assert.rejects(
    () =>
      pinDirectory(
        [
          { relpath: "a.json", bytes: new Uint8Array() },
          { relpath: "b.json", bytes: new Uint8Array() },
        ],
        { jwt: "BAD", fetch: fetchMock },
      ),
    /HTTP 401/,
  );
});

test("pinDirectory throws when response lacks IpfsHash", async () => {
  const { fetchMock } = await captureRequest(
    () => new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  );
  await assert.rejects(
    () =>
      pinDirectory(
        [
          { relpath: "a.json", bytes: new Uint8Array() },
          { relpath: "b.json", bytes: new Uint8Array() },
        ],
        { jwt: "X", fetch: fetchMock },
      ),
    /missing IpfsHash/,
  );
});

test("pinDirectory rejects 0-file and 1-file pins (Pinata flattens single-file directories)", async () => {
  await assert.rejects(
    () => pinDirectory([], { jwt: "X" }),
    /at least one file/,
  );
  await assert.rejects(
    () => pinDirectory([{ relpath: "a.json", bytes: new Uint8Array() }], { jwt: "X" }),
    /at least 2 files/,
  );
});

test("verifyPinResolves returns null on full success", async () => {
  const fetchMock: typeof fetch = async () => new Response("{}", { status: 200 });
  const result = {
    cid: FAKE_CID,
    files: [
      {
        relpath: "a.json",
        ipfsUri: `ipfs://${FAKE_CID}/a.json`,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${FAKE_CID}/a.json`,
      },
      {
        relpath: "b.json",
        ipfsUri: `ipfs://${FAKE_CID}/b.json`,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${FAKE_CID}/b.json`,
      },
    ],
  };
  assert.equal(await verifyPinResolves(result, { fetch: fetchMock }), null);
});

test("verifyPinResolves returns the first failing file on non-2xx", async () => {
  const fetchMock: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("a.json")) return new Response("ok", { status: 200 });
    return new Response("not found", { status: 404 });
  };
  const result = {
    cid: FAKE_CID,
    files: [
      { relpath: "a.json", ipfsUri: "x", gatewayUrl: "https://gateway/a.json" },
      { relpath: "b.json", ipfsUri: "x", gatewayUrl: "https://gateway/b.json" },
    ],
  };
  const fail = await verifyPinResolves(result, { fetch: fetchMock });
  assert.deepEqual(fail, { relpath: "b.json", reason: "HTTP 404" });
});
