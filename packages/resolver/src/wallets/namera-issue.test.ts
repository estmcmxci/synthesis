import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { base } from "viem/chains";
import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";
import {
  issueKeystore,
  issueSmartAccount,
  issueSessionKey,
  readSessionKeyForRuntime,
} from "./namera-issue.js";
import { createKeystore } from "./keystore.js";

function tmpStoreDir(): string {
  return mkdtempSync(join(tmpdir(), "synthesis-issue-"));
}

// A deterministic owner key + matching keystore for tests that need a real
// KeystoreJson but don't want to round-trip through issueKeystore.
const TEST_OWNER_PK = "0x4444444444444444444444444444444444444444444444444444444444444444";
const TEST_OWNER_PWD = "owner-pass";
const ownerKeystore = createKeystore({ privateKey: TEST_OWNER_PK, password: TEST_OWNER_PWD });

// Stub for @namera-ai/sdk createEcdsaAccountClient — returns a viem-shaped
// object with the deterministic kernel address we expect downstream tests to
// assert against.
function makeFakeAccountClient(address: `0x${string}`): any {
  return {
    account: { address },
    chain: base,
    transport: () => undefined,
  };
}

test("issueKeystore — first call creates the file, second is a no-op (alias-keyed step-skip)", async () => {
  const dir = tmpStoreDir();
  try {
    const r1 = await issueKeystore({ alias: "bravo", password: "p", storeDir: dir });
    assert.equal(r1.created, true);
    assert.match(r1.address, /^0x[0-9a-fA-F]{40}$/);

    const r2 = await issueKeystore({ alias: "bravo", password: "p", storeDir: dir });
    assert.equal(r2.created, false);
    assert.equal(r2.address, r1.address);
    assert.equal(r2.keystorePath, r1.keystorePath);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issueKeystore — written file is a Web3 V3 keystore with locked AES-256-GCM", async () => {
  const dir = tmpStoreDir();
  try {
    const r = await issueKeystore({ alias: "bravo", password: "p", storeDir: dir });
    const stored = JSON.parse(readFileSync(r.keystorePath, "utf8"));
    assert.equal(stored.version, 3);
    assert.equal(stored.crypto.cipher, "aes-256-gcm");
    assert.equal(stored.crypto.kdf, "scrypt");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issueSmartAccount — derives kernel address via SDK + persists chain + chainId (chainId is source-of-truth)", async () => {
  const dir = tmpStoreDir();
  try {
    const KERNEL = "0xCafe000000000000000000000000000000000000" as `0x${string}`;
    const r = await issueSmartAccount({
      alias: "bravo",
      ownerKeystore,
      ownerPassword: TEST_OWNER_PWD,
      chain: base,
      chainLabel: "base",
      rpc: "https://mainnet.base.org",
      bundlerUrl: "https://public.pimlico.io/v2/8453/rpc",
      storeDir: dir,
      _createAccountClient: (async () => makeFakeAccountClient(KERNEL)) as any,
    });
    assert.equal(r.created, true);
    assert.equal(r.address, KERNEL);
    assert.equal(r.chainId, 8453);

    const stored = JSON.parse(readFileSync(r.smartAccountPath, "utf8"));
    // Both fields stored, but chainId is the consumer-stable source-of-truth
    // for downstream tooling. `chain` is a human label that may drift.
    assert.equal(stored.chainId, 8453);
    assert.equal(stored.chain, "base");
    assert.equal(stored.address, KERNEL);
    assert.equal(stored.kernelVersion, "0.3.3");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issueSmartAccount — second call with same alias is a no-op", async () => {
  const dir = tmpStoreDir();
  try {
    const KERNEL = "0xCafe000000000000000000000000000000000000" as `0x${string}`;
    const stub = (async () => makeFakeAccountClient(KERNEL)) as any;
    const r1 = await issueSmartAccount({
      alias: "bravo",
      ownerKeystore,
      ownerPassword: TEST_OWNER_PWD,
      chain: base,
      chainLabel: "base",
      rpc: "rpc",
      bundlerUrl: "bundler",
      storeDir: dir,
      _createAccountClient: stub,
    });
    const r2 = await issueSmartAccount({
      alias: "bravo",
      ownerKeystore,
      ownerPassword: TEST_OWNER_PWD,
      chain: base,
      chainLabel: "base",
      rpc: "rpc",
      bundlerUrl: "bundler",
      storeDir: dir,
      _createAccountClient: stub,
    });
    assert.equal(r1.created, true);
    assert.equal(r2.created, false);
    assert.equal(r2.address, r1.address);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issueSessionKey — generates random inner passphrase + persists encrypted blob (refinement 1)", async () => {
  const dir = tmpStoreDir();
  try {
    const KERNEL = "0xCafe000000000000000000000000000000000000" as `0x${string}`;
    const SESSION_PK = "0x9999999999999999999999999999999999999999999999999999999999999999";

    const r = await issueSessionKey({
      alias: "bravo",
      ownerKeystore,
      ownerPassword: TEST_OWNER_PWD,
      chain: base,
      chainLabel: "base",
      rpc: "rpc",
      bundlerUrl: "bundler",
      storeDir: dir,
      _createAccountClient: (async () => makeFakeAccountClient(KERNEL)) as any,
      _createSessionKey: (async () => ({
        serializedAccounts: [{ chainId: 8453, serializedAccount: "BASE64-blob-xyz" }],
      })) as any,
      _generatePrivateKey: () => SESSION_PK,
    });

    assert.equal(r.created, true);
    assert.equal(r.kernelWallet, KERNEL);
    assert.equal(r.chainId, 8453);
    assert.equal(r.sessionKeyAddress, privateKeyToAccount(SESSION_PK).address);

    const stored = JSON.parse(readFileSync(r.sessionKeyPath, "utf8"));
    // The inner passphrase is generated AT issuance time, stored alongside
    // the ciphertext, never touched by the operator.
    assert.match(stored.innerPassphrase, /^[0-9a-f]{64}$/);
    assert.equal(stored.encryptedSessionPrivateKey.crypto.cipher, "aes-256-gcm");
    // Source-of-truth field is chainId; chain is a human label.
    assert.equal(stored.chainId, 8453);
    assert.equal(stored.chain, "base");
    // Default policies imply a 168h ttl + 0.001 ETH gas cap.
    assert.equal(stored.ttlHours, 168);
    assert.equal(stored.gasCapWei, "1000000000000000");
    assert.equal(stored.serializedAccount, "BASE64-blob-xyz");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issueSessionKey — encrypted blob round-trips via readSessionKeyForRuntime", async () => {
  // The runtime adapter (createNameraSigner) consumes the session-key
  // file. This test asserts the file format issuance writes is the format
  // the runtime can read back, without operator-supplied passphrases.
  const dir = tmpStoreDir();
  try {
    const KERNEL = "0xCafe000000000000000000000000000000000000" as `0x${string}`;
    const SESSION_PK = "0x9999999999999999999999999999999999999999999999999999999999999999";
    const r = await issueSessionKey({
      alias: "bravo",
      ownerKeystore,
      ownerPassword: TEST_OWNER_PWD,
      chain: base,
      chainLabel: "base",
      rpc: "rpc",
      bundlerUrl: "bundler",
      storeDir: dir,
      _createAccountClient: (async () => makeFakeAccountClient(KERNEL)) as any,
      _createSessionKey: (async () => ({
        serializedAccounts: [{ chainId: 8453, serializedAccount: "BLOB" }],
      })) as any,
      _generatePrivateKey: () => SESSION_PK,
    });
    const reloaded = readSessionKeyForRuntime(r.sessionKeyPath);
    assert.equal(reloaded.sessionPrivateKey, SESSION_PK);
    assert.equal(reloaded.serializedAccount, "BLOB");
    assert.equal(reloaded.kernelWallet, KERNEL);
    assert.equal(reloaded.chainId, 8453);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issueSessionKey — second call is a no-op (alias-keyed)", async () => {
  const dir = tmpStoreDir();
  try {
    const KERNEL = "0xCafe000000000000000000000000000000000000" as `0x${string}`;
    const stub = {
      _createAccountClient: (async () => makeFakeAccountClient(KERNEL)) as any,
      _createSessionKey: (async () => ({
        serializedAccounts: [{ chainId: 8453, serializedAccount: "BLOB" }],
      })) as any,
      _generatePrivateKey: generatePrivateKey,
    };
    const args = {
      alias: "bravo",
      ownerKeystore,
      ownerPassword: TEST_OWNER_PWD,
      chain: base,
      chainLabel: "base",
      rpc: "rpc",
      bundlerUrl: "bundler",
      storeDir: dir,
      ...stub,
    };
    const r1 = await issueSessionKey(args);
    const r2 = await issueSessionKey(args);
    assert.equal(r1.created, true);
    assert.equal(r2.created, false);
    assert.equal(r2.sessionKeyPath, r1.sessionKeyPath);
    assert.equal(r2.sessionKeyAddress, r1.sessionKeyAddress);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issueSessionKey — throws when SDK doesn't return a serialized account for the requested chain", async () => {
  const dir = tmpStoreDir();
  try {
    await assert.rejects(
      () =>
        issueSessionKey({
          alias: "bravo",
          ownerKeystore,
          ownerPassword: TEST_OWNER_PWD,
          chain: base, // chainId 8453
          chainLabel: "base",
          rpc: "rpc",
          bundlerUrl: "bundler",
          storeDir: dir,
          _createAccountClient: (async () =>
            makeFakeAccountClient("0xCafe000000000000000000000000000000000000" as `0x${string}`)) as any,
          // SDK returns a chainId we didn't ask for
          _createSessionKey: (async () => ({
            serializedAccounts: [{ chainId: 1, serializedAccount: "WRONG" }],
          })) as any,
        }),
      /did not return a serialized account for chainId 8453/,
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("issueKeystore — wrong owner password during issueSmartAccount throws invalid password", async () => {
  const dir = tmpStoreDir();
  try {
    const ks = await issueKeystore({ alias: "bravo", password: "right", storeDir: dir });
    void ks;
    await assert.rejects(
      () =>
        issueSmartAccount({
          alias: "bravo",
          ownerKeystore,
          ownerPassword: "wrong",
          chain: base,
          chainLabel: "base",
          rpc: "rpc",
          bundlerUrl: "bundler",
          storeDir: dir,
          _createAccountClient: (async () =>
            makeFakeAccountClient("0xCafe000000000000000000000000000000000000" as `0x${string}`)) as any,
        }),
      /invalid password/,
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});
