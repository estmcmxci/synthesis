/**
 * Web3 V3-style keystore — AES-256-GCM encryption, scrypt KDF.
 *
 * Cipher choice: AES-256-GCM (authenticated). The canonical V3 spec
 * uses AES-128-CTR with a separate keccak256 MAC, but GCM is modern and
 * folds integrity into the cipher itself — no separate MAC roundtrip
 * means one less place for a downgrade bug to live. Tools that import
 * V3 wallets (geth, ethers, viem) all support GCM via the same
 * `cipher` field; the format stays portable.
 *
 * Layout (JSON):
 *   {
 *     "version": 3,
 *     "address": "<lowercase-hex-without-0x>",
 *     "id": "<random uuid v4>",
 *     "crypto": {
 *       "cipher": "aes-256-gcm",
 *       "ciphertext": "<hex>",
 *       "cipherparams": { "iv": "<hex>" },
 *       "kdf": "scrypt",
 *       "kdfparams": { "dklen": 32, "n": 131072, "r": 8, "p": 1, "salt": "<hex>" },
 *       "mac": "<hex of GCM auth tag>"
 *     }
 *   }
 *
 * The `mac` field carries the GCM auth tag (16 bytes) for spec
 * compatibility with V3 — wrong-password attempts fail at decrypt time
 * with an authentication error rather than producing garbage bytes.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";
import { privateKeyToAddress } from "viem/accounts";
import type { Hex } from "viem";

export interface KeystoreJson {
  version: 3;
  address: string; // lowercase hex without 0x prefix
  id: string;
  crypto: {
    cipher: "aes-256-gcm";
    ciphertext: string;
    cipherparams: { iv: string };
    kdf: "scrypt";
    kdfparams: {
      dklen: 32;
      n: number;
      r: number;
      p: number;
      salt: string;
    };
    mac: string;
  };
}

const SCRYPT_N = 131072; // 2^17 — V3 standard
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DK_LEN = 32;
const IV_LEN = 12; // GCM standard
const SALT_LEN = 32;

function toHex(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("hex");
}

function fromHex(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a 0x-prefixed 32-byte private key under the given password.
 * Returns a Web3 V3-style keystore JSON object.
 */
export function createKeystore(args: {
  privateKey: Hex;
  password: string;
}): KeystoreJson {
  const pk = args.privateKey.startsWith("0x") ? args.privateKey.slice(2) : args.privateKey;
  if (pk.length !== 64) {
    throw new Error("createKeystore: privateKey must be 32 bytes (64 hex chars)");
  }
  const address = privateKeyToAddress(`0x${pk}` as Hex);
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const derivedKey = scryptSync(args.password, salt, DK_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  });
  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv) as CipherGCM;
  const ciphertext = Buffer.concat([
    cipher.update(fromHex(pk)),
    cipher.final(),
  ]);
  const mac = cipher.getAuthTag();

  return {
    version: 3,
    address: address.slice(2).toLowerCase(),
    id: randomUUID(),
    crypto: {
      cipher: "aes-256-gcm",
      ciphertext: toHex(ciphertext),
      cipherparams: { iv: toHex(iv) },
      kdf: "scrypt",
      kdfparams: {
        dklen: DK_LEN,
        n: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        salt: toHex(salt),
      },
      mac: toHex(mac),
    },
  };
}

export interface DecryptedKey {
  address: Hex;
  privateKey: Hex;
}

/**
 * Decrypt a V3 keystore. Wrong password throws `Error("invalid password")`
 * — GCM authentication failure surfaces as a thrown error from
 * `decipher.final()`, which we normalize so callers don't have to
 * pattern-match on Node's crypto error text.
 */
export function decryptKeystore(json: KeystoreJson, password: string): DecryptedKey {
  if (json.version !== 3) throw new Error(`unsupported keystore version: ${json.version}`);
  if (json.crypto.cipher !== "aes-256-gcm")
    throw new Error(`unsupported cipher: ${json.crypto.cipher}`);
  if (json.crypto.kdf !== "scrypt") throw new Error(`unsupported kdf: ${json.crypto.kdf}`);

  const { kdfparams, ciphertext, cipherparams, mac } = json.crypto;
  const derivedKey = scryptSync(password, fromHex(kdfparams.salt), kdfparams.dklen, {
    N: kdfparams.n,
    r: kdfparams.r,
    p: kdfparams.p,
    maxmem: 256 * 1024 * 1024,
  });
  const decipher = createDecipheriv(
    "aes-256-gcm",
    derivedKey,
    fromHex(cipherparams.iv),
  ) as DecipherGCM;
  decipher.setAuthTag(fromHex(mac));
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(fromHex(ciphertext)), decipher.final()]);
  } catch {
    throw new Error("invalid password");
  }
  const privateKey = `0x${toHex(plaintext)}` as Hex;
  const address = privateKeyToAddress(privateKey);
  // Sanity: the derived address must match the file's `address` field;
  // if they don't, the keystore was tampered with after creation.
  if (address.slice(2).toLowerCase() !== json.address.toLowerCase()) {
    throw new Error("keystore address mismatch — file may be corrupted");
  }
  return { address, privateKey };
}
