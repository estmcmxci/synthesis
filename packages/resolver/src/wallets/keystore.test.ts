import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { createKeystore, decryptKeystore } from "./keystore.js";

test("createKeystore — produces a Web3 V3-style JSON with locked cipher = aes-256-gcm", () => {
  const pk = generatePrivateKey();
  const ks = createKeystore({ privateKey: pk, password: "hunter2" });
  assert.equal(ks.version, 3);
  assert.equal(ks.crypto.cipher, "aes-256-gcm");
  assert.equal(ks.crypto.kdf, "scrypt");
  assert.equal(ks.address, privateKeyToAddress(pk).slice(2).toLowerCase());
  assert.match(ks.id, /^[0-9a-f-]{36}$/);
  // sanity: required hex fields are present and non-empty
  assert.ok(ks.crypto.ciphertext.length > 0);
  assert.equal(ks.crypto.cipherparams.iv.length, 24); // 12 bytes
  assert.equal(ks.crypto.kdfparams.salt.length, 64); // 32 bytes
  assert.equal(ks.crypto.mac.length, 32); // 16-byte GCM tag
});

test("createKeystore + decryptKeystore — round-trip yields the same private key", () => {
  const pk = generatePrivateKey();
  const ks = createKeystore({ privateKey: pk, password: "hunter2" });
  const decrypted = decryptKeystore(ks, "hunter2");
  assert.equal(decrypted.privateKey, pk);
  assert.equal(decrypted.address, privateKeyToAddress(pk));
});

test("decryptKeystore — wrong password throws `invalid password`", () => {
  const pk = generatePrivateKey();
  const ks = createKeystore({ privateKey: pk, password: "right" });
  assert.throws(() => decryptKeystore(ks, "wrong"), /invalid password/);
});

test("decryptKeystore — tampered ciphertext fails authentication", () => {
  const pk = generatePrivateKey();
  const ks = createKeystore({ privateKey: pk, password: "p" });
  // Flip a bit of ciphertext — GCM auth must fail.
  const tampered = {
    ...ks,
    crypto: {
      ...ks.crypto,
      ciphertext: ks.crypto.ciphertext.replace(/^[0-9a-f]/, (c) =>
        c === "0" ? "1" : "0",
      ),
    },
  };
  assert.throws(() => decryptKeystore(tampered, "p"), /invalid password/);
});

test("decryptKeystore — tampered address field surfaces as a mismatch error", () => {
  const pk = generatePrivateKey();
  const ks = createKeystore({ privateKey: pk, password: "p" });
  const tampered = { ...ks, address: "0".repeat(40) };
  assert.throws(() => decryptKeystore(tampered, "p"), /address mismatch/);
});

test("createKeystore — rejects malformed private keys", () => {
  assert.throws(
    () => createKeystore({ privateKey: "0x123" as `0x${string}`, password: "p" }),
    /must be 32 bytes/,
  );
});

test("decryptKeystore — rejects unsupported version + cipher + kdf", () => {
  const pk = generatePrivateKey();
  const ks = createKeystore({ privateKey: pk, password: "p" });
  assert.throws(
    () => decryptKeystore({ ...ks, version: 1 as never }, "p"),
    /unsupported keystore version/,
  );
  assert.throws(
    () =>
      decryptKeystore(
        { ...ks, crypto: { ...ks.crypto, cipher: "aes-128-ctr" as never } },
        "p",
      ),
    /unsupported cipher/,
  );
  assert.throws(
    () =>
      decryptKeystore(
        { ...ks, crypto: { ...ks.crypto, kdf: "pbkdf2" as never } },
        "p",
      ),
    /unsupported kdf/,
  );
});

test("createKeystore — two encryptions of the same key produce different ciphertext (random IV + salt)", () => {
  const pk = generatePrivateKey();
  const a = createKeystore({ privateKey: pk, password: "p" });
  const b = createKeystore({ privateKey: pk, password: "p" });
  assert.notEqual(a.crypto.ciphertext, b.crypto.ciphertext);
  assert.notEqual(a.crypto.kdfparams.salt, b.crypto.kdfparams.salt);
  assert.notEqual(a.crypto.cipherparams.iv, b.crypto.cipherparams.iv);
  // both must still decrypt to the same key
  assert.equal(decryptKeystore(a, "p").privateKey, pk);
  assert.equal(decryptKeystore(b, "p").privateKey, pk);
});
