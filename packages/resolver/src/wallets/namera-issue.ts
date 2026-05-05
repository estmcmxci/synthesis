/**
 * Three-step issuance ceremony for an ENS-bound agent's wallet stack:
 *
 *   1. issueKeystore   — owner key generated + encrypted at rest
 *   2. issueSmartAccount — kernel address derived (lazy-deploy on first UserOp)
 *   3. issueSessionKey — fresh signer + policies → serialized blob
 *
 * Each step is alias-keyed and writes to `~/.synthesis/<dir>/<alias>.json`.
 * If the file already exists the step is skipped and `created: false` is
 * returned. Matches `issue-namera.sh` semantics, but using the
 * @namera-ai/sdk programmatic APIs directly — no shell-out.
 *
 * Read-only on ENS. Writes only to `storeDir` (defaults to ~/.synthesis).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Chain,
  type Hex,
  type EntryPointVersion,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  privateKeyToAddress,
} from "viem/accounts";
import { KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { toSudoPolicy, toTimestampPolicy, toGasPolicy } from "@zerodev/permissions/policies";
import { createEcdsaAccountClient } from "@namera-ai/sdk/account";
import { createEcdsaSessionKey } from "@namera-ai/sdk/session-key";
import {
  createKeystore,
  decryptKeystore,
  type KeystoreJson,
} from "./keystore.js";

// =============================================================================
// On-disk shapes
// =============================================================================

export interface SmartAccountFile {
  alias: string;
  ownerAlias: string;
  address: Address;
  chain: string;
  chainId: number;
  kernelVersion: string;
  index: string; // bigint as base-10 string for portability
}

export interface SessionKeyFile {
  alias: string;
  smartAccountAlias: string;
  sessionKeyAddress: Address;
  kernelWallet: Address;
  chain: string;
  chainId: number;
  validUntil: number; // unix-seconds
  ttlHours: number;
  gasCapWei: string; // bigint as string
  /**
   * Random per-file passphrase. Encrypts the session-key private blob
   * below. Stored alongside the ciphertext so the runtime adapter
   * (`createNameraSigner`) can decrypt without operator involvement.
   * Decoupled from the keystore password so a leaked owner password
   * doesn't compromise live session keys (and vice versa).
   */
  encryptedSessionPrivateKey: KeystoreJson;
  innerPassphrase: string;
  /** Serialized permission account from @namera-ai/sdk — what
   *  createSessionKeyClient consumes at runtime. */
  serializedAccount: string;
}

// =============================================================================
// Path helpers
// =============================================================================

const DEFAULT_STORE_DIR = join(homedir(), ".synthesis");

function keystorePath(storeDir: string, alias: string): string {
  return join(storeDir, "keystores", `${alias}.json`);
}
function smartAccountPath(storeDir: string, alias: string): string {
  return join(storeDir, "smart-accounts", `${alias}.json`);
}
function sessionKeyPath(storeDir: string, alias: string): string {
  return join(storeDir, "session-keys", `${alias}.json`);
}

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(value, null, 2));
}

// =============================================================================
// Step 1: keystore
// =============================================================================

export interface IssueKeystoreOptions {
  alias: string;
  password: string;
  storeDir?: string;
  /** Inject a fresh private key for tests. Default: viem generatePrivateKey. */
  generatePrivateKey?: () => Hex;
}

export interface IssueKeystoreResult {
  alias: string;
  address: Address;
  keystorePath: string;
  created: boolean;
}

export async function issueKeystore(
  opts: IssueKeystoreOptions,
): Promise<IssueKeystoreResult> {
  const storeDir = opts.storeDir ?? DEFAULT_STORE_DIR;
  const path = keystorePath(storeDir, opts.alias);
  if (existsSync(path)) {
    const existing = readJson<KeystoreJson>(path);
    // V3 stores lowercase; checksum on the way out so the address matches
    // what `privateKeyToAddress` returned at creation time.
    return {
      alias: opts.alias,
      address: getAddress(`0x${existing.address}`),
      keystorePath: path,
      created: false,
    };
  }
  const pk = (opts.generatePrivateKey ?? generatePrivateKey)();
  const ks = createKeystore({ privateKey: pk, password: opts.password });
  writeJson(path, ks);
  return {
    alias: opts.alias,
    address: privateKeyToAddress(pk),
    keystorePath: path,
    created: true,
  };
}

// =============================================================================
// Step 2: smart-account
// =============================================================================

export interface IssueSmartAccountOptions {
  alias: string;
  ownerKeystore: KeystoreJson;
  ownerPassword: string;
  chain: Chain;
  chainLabel: string; // "base" / "base-sepolia" — the human label
  rpc: string;
  bundlerUrl: string;
  kernelVersion?: string; // default KERNEL_V3_3
  index?: bigint;
  storeDir?: string;
  /** Inject the SDK constructor for tests. Default: createEcdsaAccountClient. */
  _createAccountClient?: typeof createEcdsaAccountClient;
}

export interface IssueSmartAccountResult {
  alias: string;
  address: Address;
  /**
   * Human chain label as recorded on disk. When `created: false`, this
   * comes from the persisted smart-account file — NOT from the caller's
   * `chainLabel` parameter — so callers detect drift instead of silently
   * agreeing with whatever the latest run requested.
   */
  chain: string;
  chainId: number;
  kernelVersion: string;
  /** bigint serialized as base-10 string, matching the on-disk shape. */
  index: string;
  smartAccountPath: string;
  created: boolean;
}

export async function issueSmartAccount(
  opts: IssueSmartAccountOptions,
): Promise<IssueSmartAccountResult> {
  const storeDir = opts.storeDir ?? DEFAULT_STORE_DIR;
  const path = smartAccountPath(storeDir, opts.alias);
  if (existsSync(path)) {
    const existing = readJson<SmartAccountFile>(path);
    // Drift check: if the caller passed a chain that disagrees with the
    // persisted file, refuse rather than silently returning the wrong
    // chain. The smart-account address is bound to the chain where it was
    // derived; reissuing with --chain base-sepolia after a base mainnet
    // run would otherwise produce an IssueResult with chainId=84532 and a
    // kernel address that's actually on chainId=8453.
    if (existing.chainId !== opts.chain.id) {
      throw new Error(
        `smart-account file at ${path} is bound to chainId=${existing.chainId} (chain=${existing.chain}); ` +
          `caller requested chainId=${opts.chain.id} (chain=${opts.chainLabel}). ` +
          `rm the file to re-issue under a different chain.`,
      );
    }
    return {
      alias: opts.alias,
      address: existing.address,
      chain: existing.chain,
      chainId: existing.chainId,
      kernelVersion: existing.kernelVersion,
      index: existing.index,
      smartAccountPath: path,
      created: false,
    };
  }

  const owner = decryptKeystore(opts.ownerKeystore, opts.ownerPassword);
  const ownerAccount = privateKeyToAccount(owner.privateKey);
  const publicClient = createPublicClient({
    chain: opts.chain,
    transport: http(opts.rpc),
  });
  const kernelVersion = opts.kernelVersion ?? KERNEL_V3_3;
  const index = opts.index ?? 0n;

  const create = opts._createAccountClient ?? createEcdsaAccountClient;
  // biome-ignore lint/suspicious/noExplicitAny: SDK's createEcdsaAccountClient
  // is heavily generic; we pass through fully-typed params and let runtime
  // narrowing handle the rest. Same pattern used in wallets/namera.ts.
  const accountClient = await create({
    type: "ecdsa",
    signer: ownerAccount,
    client: publicClient,
    chain: opts.chain,
    bundlerTransport: http(opts.bundlerUrl),
    entrypointVersion: "0.7" satisfies EntryPointVersion,
    kernelVersion,
    index,
  } as any);

  const file: SmartAccountFile = {
    alias: opts.alias,
    ownerAlias: opts.alias, // 1:1 owner/account in v0.1
    address: accountClient.account.address,
    chain: opts.chainLabel,
    chainId: opts.chain.id,
    kernelVersion: String(kernelVersion),
    index: index.toString(),
  };
  writeJson(path, file);

  return {
    alias: opts.alias,
    address: file.address,
    chain: file.chain,
    chainId: file.chainId,
    kernelVersion: file.kernelVersion,
    index: file.index,
    smartAccountPath: path,
    created: true,
  };
}

// =============================================================================
// Step 3: session-key
// =============================================================================

export interface IssueSessionKeyOptions {
  alias: string;
  ownerKeystore: KeystoreJson;
  ownerPassword: string;
  chain: Chain;
  chainLabel: string;
  rpc: string;
  bundlerUrl: string;
  kernelVersion?: string;
  /**
   * Smart-account derivation index. MUST match what was used at
   * `issueSmartAccount` time — the kernel address is `f(owner, index,
   * kernelVersion)` and a different index produces a different kernel
   * address. Default 0n, but the CLI threads through whatever was
   * passed to `agent issue --index`.
   */
  index?: bigint;
  ttlHours?: number; // default 168
  gasCapWei?: bigint; // default 0.001 ETH
  storeDir?: string;
  /** Inject for tests. */
  _createAccountClient?: typeof createEcdsaAccountClient;
  _createSessionKey?: typeof createEcdsaSessionKey;
  _generatePrivateKey?: () => Hex;
}

export interface IssueSessionKeyResult {
  alias: string;
  sessionKeyAddress: Address;
  kernelWallet: Address;
  /** Human chain label, sourced from the persisted file when it exists. */
  chain: string;
  chainId: number;
  validUntil: number;
  ttlHours: number;
  sessionKeyPath: string;
  created: boolean;
}

const DEFAULT_TTL_HOURS = 168;
const DEFAULT_GAS_CAP_WEI = 1_000_000_000_000_000n; // 0.001 ETH

export async function issueSessionKey(
  opts: IssueSessionKeyOptions,
): Promise<IssueSessionKeyResult> {
  const storeDir = opts.storeDir ?? DEFAULT_STORE_DIR;
  const path = sessionKeyPath(storeDir, opts.alias);
  if (existsSync(path)) {
    const existing = readJson<SessionKeyFile>(path);
    if (existing.chainId !== opts.chain.id) {
      throw new Error(
        `session-key file at ${path} is bound to chainId=${existing.chainId} (chain=${existing.chain}); ` +
          `caller requested chainId=${opts.chain.id} (chain=${opts.chainLabel}). ` +
          `rm the file to re-issue under a different chain.`,
      );
    }
    return {
      alias: opts.alias,
      sessionKeyAddress: existing.sessionKeyAddress,
      kernelWallet: existing.kernelWallet,
      chain: existing.chain,
      chainId: existing.chainId,
      validUntil: existing.validUntil,
      ttlHours: existing.ttlHours,
      sessionKeyPath: path,
      created: false,
    };
  }

  // Re-derive the kernel-account client so the session key is bound to
  // the same address the smart-account file recorded. We don't read the
  // smart-account file here; the SDK derives address from owner+index
  // deterministically.
  const owner = decryptKeystore(opts.ownerKeystore, opts.ownerPassword);
  const ownerAccount = privateKeyToAccount(owner.privateKey);
  const publicClient = createPublicClient({
    chain: opts.chain,
    transport: http(opts.rpc),
  });
  const kernelVersion = opts.kernelVersion ?? KERNEL_V3_3;
  const ttlHours = opts.ttlHours ?? DEFAULT_TTL_HOURS;
  const gasCapWei = opts.gasCapWei ?? DEFAULT_GAS_CAP_WEI;
  const validUntil = Math.floor(Date.now() / 1000) + ttlHours * 3600;

  // We still create the account client to get back the deterministic
  // kernel address — we record it in the session-key file so the runtime
  // adapter can verify it matches what's on ENS later.
  // Re-derive the kernel-account client using the SAME `index` that was
  // passed to `issueSmartAccount`. Without this, --index N>0 would
  // produce a session-key bound to a kernel at index 0 while the
  // smart-account file records a kernel at index N — silently broken.
  const createAccount = opts._createAccountClient ?? createEcdsaAccountClient;
  const index = opts.index ?? 0n;
  const accountClient = await createAccount({
    type: "ecdsa",
    signer: ownerAccount,
    client: publicClient,
    chain: opts.chain,
    bundlerTransport: http(opts.bundlerUrl),
    entrypointVersion: "0.7" satisfies EntryPointVersion,
    kernelVersion,
    index,
  // biome-ignore lint/suspicious/noExplicitAny: deep generic narrowing.
  } as any);

  const sessionPrivateKey = (opts._generatePrivateKey ?? generatePrivateKey)();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);

  const policies = [
    toSudoPolicy({}),
    toTimestampPolicy({ validAfter: 0, validUntil }),
    toGasPolicy({ allowed: gasCapWei, enforcePaymaster: false }),
  ];

  const createSk = opts._createSessionKey ?? createEcdsaSessionKey;
  // `clients` is an array of PUBLIC clients (one per chain) — NOT kernel-
  // account clients. namera-ai/sdk re-derives the kernel account internally
  // for each chain via `createKernelAccount(client, ...)`, where `client`
  // must be the public RPC client (zerodev calls `eth_call` on it for
  // `getSenderAddress`). Passing the kernel-account client here routes
  // simulation through the BUNDLER transport — which on Pimlico's public
  // tier strips eth_call revert data, breaking the parser at
  // @zerodev/sdk/actions/public/getSenderAddress.ts:165.
  const result = await createSk({
    type: "ecdsa",
    accountType: "ecdsa",
    entrypointVersion: "0.7" satisfies EntryPointVersion,
    kernelVersion,
    clients: [publicClient],
    signer: ownerAccount,
    sessionPrivateKey,
    policies,
  // biome-ignore lint/suspicious/noExplicitAny: deep generic narrowing.
  } as any);

  const serializedForChain = result.serializedAccounts.find(
    (s) => s.chainId === opts.chain.id,
  );
  if (!serializedForChain) {
    throw new Error(
      `issueSessionKey: SDK did not return a serialized account for chainId ${opts.chain.id}`,
    );
  }

  // Per refinement 1: generate a fresh inner passphrase for the session
  // private key (NOT the owner password). Stored alongside the ciphertext
  // in the same JSON. Operators never see or supply this.
  const innerPassphrase = randomBytes(32).toString("hex");
  const encryptedSessionPrivateKey = createKeystore({
    privateKey: sessionPrivateKey,
    password: innerPassphrase,
  });

  const file: SessionKeyFile = {
    alias: opts.alias,
    smartAccountAlias: opts.alias,
    sessionKeyAddress: sessionAccount.address,
    kernelWallet: accountClient.account.address,
    chain: opts.chainLabel,
    chainId: opts.chain.id,
    validUntil,
    ttlHours,
    gasCapWei: gasCapWei.toString(),
    encryptedSessionPrivateKey,
    innerPassphrase,
    serializedAccount: serializedForChain.serializedAccount,
  };
  writeJson(path, file);

  return {
    alias: opts.alias,
    sessionKeyAddress: sessionAccount.address,
    kernelWallet: accountClient.account.address,
    chain: file.chain,
    chainId: file.chainId,
    validUntil,
    ttlHours,
    sessionKeyPath: path,
    created: true,
  };
}

// =============================================================================
// Reload helpers (used by the runtime adapter)
// =============================================================================

/**
 * Read the session-key file and extract `{sessionPrivateKey, serializedAccount}`
 * for `createNameraSigner`. Encapsulates the inner-passphrase decryption so
 * runtime callers never handle the passphrase directly.
 */
export function readSessionKeyForRuntime(path: string): {
  sessionPrivateKey: Hex;
  serializedAccount: string;
  kernelWallet: Address;
  chainId: number;
} {
  const file = readJson<SessionKeyFile>(path);
  const decrypted = decryptKeystore(
    file.encryptedSessionPrivateKey,
    file.innerPassphrase,
  );
  return {
    sessionPrivateKey: decrypted.privateKey,
    serializedAccount: file.serializedAccount,
    kernelWallet: file.kernelWallet,
    chainId: file.chainId,
  };
}
