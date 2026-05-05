/**
 * `ensemble agent issue <alias>` — CLI presenter.
 *
 * Bootstraps a fresh agent's wallet stack: keystore + smart-account +
 * session-key, all alias-keyed under ~/.synthesis/. Each step skips if
 * its file already exists.
 *
 * Owner key is encrypted with `$SYNTHESIS_KEYSTORE_PASSWORD` (required).
 * The session-key file carries its own random per-file passphrase
 * generated at issuance time — operators never supply or see it.
 *
 * No ENS writes. The output's field names map 1:1 to `agent publish`
 * flags so a future `--from-issue-output` is a mechanical port.
 */

import { readFileSync } from "node:fs";
import colors from "yoctocolors";
import * as chains from "viem/chains";
import {
  issueKeystore,
  issueSmartAccount,
  issueSessionKey,
  type KeystoreJson,
} from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface AgentIssueCliOptions {
  alias: string;
  chain?: string;
  rpc?: string;
  bundler?: string;
  kernelVersion?: string;
  ttlHours?: string;
  gasCapWei?: string;
  index?: string;
  format?: string;
}

export interface IssueResult {
  alias: string;
  kernelWallet: `0x${string}`;
  runtimePubkey: `0x${string}`;
  kernelVersion: string;
  /** Human label (e.g. "base"). May drift from chainId if a future
   * release adds a new chain — consumers MUST read chainId, not chain. */
  chain: string;
  /** Source-of-truth for downstream tooling (publish, runtime adapter,
   * explorer). chainId decides if `chain` and `chainId` ever disagree. */
  chainId: number;
  keystorePath: string;
  smartAccountPath: string;
  sessionKeyPath: string;
  ttlHours: number;
  validUntil: string; // ISO 8601
}

const KEYSTORE_PWD_ENV = "SYNTHESIS_KEYSTORE_PASSWORD";

/** Map a human chain label to a viem Chain. Adding a new chain here
 * is the only thing that should change `chainLabel → chainId` mapping;
 * consumers always read `chainId` from output, not `chain`. */
function resolveChain(label: string): { chain: import("viem").Chain; defaults: { rpc: string; bundler: string } } {
  switch (label) {
    case "base":
      return {
        chain: chains.base,
        defaults: {
          rpc: "https://mainnet.base.org",
          bundler: "https://public.pimlico.io/v2/8453/rpc",
        },
      };
    case "base-sepolia":
      return {
        chain: chains.baseSepolia,
        defaults: {
          rpc: "https://sepolia.base.org",
          bundler: "https://public.pimlico.io/v2/84532/rpc",
        },
      };
    default:
      throw new Error(`unsupported --chain ${label} (supported: base, base-sepolia)`);
  }
}

function isJsonFlag(): boolean {
  return process.argv.some(
    (arg, i, arr) =>
      arg === "--format=json" ||
      (arg === "--format" && arr[i + 1] === "json") ||
      (arg === "-f" && arr[i + 1] === "json"),
  );
}

function failInput(isJson: boolean, message: string): never {
  if (isJson) console.log(JSON.stringify({ error: message }));
  else console.error(colors.red(message));
  process.exitCode = 2;
  throw new Error(message);
}

export async function agentIssue(options: AgentIssueCliOptions): Promise<IssueResult> {
  const isJson = options.format === "json" || isJsonFlag();

  const password = process.env[KEYSTORE_PWD_ENV];
  if (!password) {
    failInput(
      isJson,
      `${KEYSTORE_PWD_ENV} env var is required (encrypts the owner keystore at ~/.synthesis/keystores/<alias>.json)`,
    );
  }

  const chainLabel = options.chain ?? "base";
  let chainResolved;
  try {
    chainResolved = resolveChain(chainLabel);
  } catch (err) {
    failInput(isJson, (err as Error).message);
  }
  const { chain, defaults } = chainResolved!;
  const rpc = options.rpc ?? defaults.rpc;
  const bundlerUrl = options.bundler ?? defaults.bundler;
  const ttlHours = options.ttlHours !== undefined ? Number(options.ttlHours) : undefined;
  if (ttlHours !== undefined && (!Number.isFinite(ttlHours) || ttlHours <= 0)) {
    failInput(isJson, `--ttl-hours: invalid (got "${options.ttlHours}")`);
  }
  const gasCapWei = options.gasCapWei !== undefined ? BigInt(options.gasCapWei) : undefined;
  const index = options.index !== undefined ? BigInt(options.index) : undefined;
  const kernelVersion = options.kernelVersion;

  // Step 1: keystore
  if (!isJson) startSpinner(`Issuing keystore for ${colors.cyan(options.alias)}...`);
  const ks = await issueKeystore({ alias: options.alias, password: password! });
  stopSpinner();
  if (!isJson) {
    console.log(
      `  ${colors.green("✓")} keystore       (${ks.created ? colors.green("created") : colors.dim("already exists")})  ${colors.dim(ks.address)}`,
    );
  }

  // Reload the keystore file (issueKeystore returns the address but not
  // the full JSON; later steps need the JSON to decrypt).
  const ownerKeystore = JSON.parse(readFileSync(ks.keystorePath, "utf8")) as KeystoreJson;

  // Step 2: smart-account
  if (!isJson) startSpinner(`Deriving smart-account for ${options.alias} on ${chainLabel}...`);
  const sa = await issueSmartAccount({
    alias: options.alias,
    ownerKeystore,
    ownerPassword: password!,
    chain,
    chainLabel,
    rpc,
    bundlerUrl,
    kernelVersion,
    index,
  });
  stopSpinner();
  if (!isJson) {
    console.log(
      `  ${colors.green("✓")} smart-account  (${sa.created ? colors.green("created") : colors.dim("already exists")})  ${colors.dim(sa.address)}`,
    );
  }

  // Step 3: session-key
  if (!isJson) startSpinner(`Issuing session key for ${options.alias}...`);
  const sk = await issueSessionKey({
    alias: options.alias,
    ownerKeystore,
    ownerPassword: password!,
    chain,
    chainLabel,
    rpc,
    bundlerUrl,
    kernelVersion,
    ttlHours,
    gasCapWei,
  });
  stopSpinner();
  if (!isJson) {
    console.log(
      `  ${colors.green("✓")} session-key    (${sk.created ? colors.green("created") : colors.dim("already exists")})  ${colors.dim(sk.sessionKeyAddress)}`,
    );
  }

  const result: IssueResult = {
    alias: options.alias,
    kernelWallet: sa.address,
    runtimePubkey: sk.sessionKeyAddress,
    kernelVersion: kernelVersion ?? "0.3.3",
    chain: chainLabel,
    chainId: chain.id,
    keystorePath: ks.keystorePath,
    smartAccountPath: sa.smartAccountPath,
    sessionKeyPath: sk.sessionKeyPath,
    ttlHours: sk.ttlHours,
    validUntil: new Date(sk.validUntil * 1000).toISOString(),
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log();
    console.log(colors.bold("  Issue Result"));
    console.log(colors.dim("  ────────────"));
    console.log(`    alias            : ${colors.cyan(result.alias)}`);
    console.log(`    kernel wallet    : ${colors.cyan(result.kernelWallet)}`);
    console.log(`    runtime pubkey   : ${colors.cyan(result.runtimePubkey)}`);
    console.log(`    chain / chainId  : ${result.chain} (${result.chainId})`);
    console.log(`    valid until      : ${result.validUntil}  (ttl ${result.ttlHours}h)`);
    console.log();
    console.log(colors.dim(`  Files:`));
    console.log(colors.dim(`    ${result.keystorePath}`));
    console.log(colors.dim(`    ${result.smartAccountPath}`));
    console.log(colors.dim(`    ${result.sessionKeyPath}`));
    console.log();
    console.log(
      colors.dim(
        `  Next: fund ${result.kernelWallet} with ~$5 of Base ETH if you want the kernel to deploy on first UserOp.`,
      ),
    );
    console.log();
  }

  process.exitCode = 0;
  return result;
}
