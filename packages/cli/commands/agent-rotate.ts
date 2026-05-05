/**
 * `ensemble agent rotate <alias> --ens <ens-name>` — CLI presenter.
 *
 * Rotates the active session key + bumps policy version. Plan-only by
 * default; --broadcast sends the multicall (matches the publish
 * convention from #51). The wallet-security memory note for this repo
 * locks the signing identity to the manager-of-emilemarcelagustin.eth
 * EOA `0xeb0A…022`, supplied via $ENS_PRIVATE_KEY (or --ledger). Same
 * env-var name as `agent publish`.
 *
 * Issues a new session-key under `<alias>-policy-v<N>` (where N is the
 * NEW on-chain version), so the filesystem layout mirrors what's
 * published. Old session-key files stay for audit; clean up via
 * `rm` if desired.
 */

import { readFileSync } from "node:fs";
import colors from "yoctocolors";
import * as chains from "viem/chains";
import {
  rotateAgent,
  type KeystoreJson,
  type RotateResult,
} from "@synthesis/resolver";
import {
  normalizeEnsName,
  getResolver,
  getNetworkConfig,
  getSignerAddress,
  getSignerAddressAsync,
  closeLedger,
} from "../utils";
import { createChainPublicClient, createChainWalletClient } from "../utils/viem";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface AgentRotateCliOptions {
  alias: string;
  ens: string;
  policyVersion?: string;
  ttlHours?: string;
  gasCapWei?: string;
  chain?: string;
  rpc?: string;
  bundler?: string;
  ipfsGateway?: string[];
  broadcast?: boolean;
  ledger?: boolean;
  accountIndex?: string;
  format?: string;
}

const KEYSTORE_PWD_ENV = "SYNTHESIS_KEYSTORE_PASSWORD";

function isJsonFlag(): boolean {
  return process.argv.some(
    (arg, i, arr) =>
      arg === "--format=json" ||
      (arg === "--format" && arr[i + 1] === "json") ||
      (arg === "-f" && arr[i + 1] === "json"),
  );
}

function fail(isJson: boolean, code: 1 | 2, message: string): never {
  if (isJson) console.log(JSON.stringify({ error: message }));
  else console.error(colors.red(message));
  process.exitCode = code;
  throw new Error(message);
}

function resolveChain(label: string): { chain: import("viem").Chain; defaultRpc: string; defaultBundler: string } {
  switch (label) {
    case "base":
      return {
        chain: chains.base,
        defaultRpc: "https://mainnet.base.org",
        defaultBundler: "https://public.pimlico.io/v2/8453/rpc",
      };
    case "base-sepolia":
      return {
        chain: chains.baseSepolia,
        defaultRpc: "https://sepolia.base.org",
        defaultBundler: "https://public.pimlico.io/v2/84532/rpc",
      };
    default:
      throw new Error(`unsupported --chain ${label} (supported: base, base-sepolia)`);
  }
}

export async function agentRotate(options: AgentRotateCliOptions): Promise<RotateResult> {
  const isJson = options.format === "json" || isJsonFlag();
  const accountIndex = options.accountIndex ? parseInt(options.accountIndex, 10) : 0;

  // Env: keystore password is always required (decrypts owner key for
  // the new session-key issuance step). ENS_PRIVATE_KEY is required only
  // for --broadcast (matches `agent publish` semantics from #51).
  const keystorePwd = process.env[KEYSTORE_PWD_ENV];
  if (!keystorePwd) {
    fail(isJson, 2, `${KEYSTORE_PWD_ENV} env var is required (decrypts the owner keystore)`);
  }
  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) {
    fail(isJson, 2, "PINATA_JWT env var is required (pins the new policy doc to IPFS)");
  }

  const chainLabel = options.chain ?? "base";
  let chainResolved;
  try {
    chainResolved = resolveChain(chainLabel);
  } catch (err) {
    fail(isJson, 2, (err as Error).message);
  }
  const { chain, defaultRpc, defaultBundler } = chainResolved!;
  const rpc = options.rpc ?? defaultRpc;
  const bundlerUrl = options.bundler ?? defaultBundler;
  const ttlHours = options.ttlHours !== undefined ? Number(options.ttlHours) : undefined;
  if (ttlHours !== undefined && (!Number.isFinite(ttlHours) || ttlHours <= 0)) {
    fail(isJson, 2, `--ttl-hours: invalid (got "${options.ttlHours}")`);
  }
  const gasCapWei = options.gasCapWei !== undefined ? BigInt(options.gasCapWei) : undefined;

  // Read the keystore from the alias-keyed path. Issuance step #53 wrote
  // it; rotation reads it without modifying.
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  const keystorePath = join(homedir(), ".synthesis", "keystores", `${options.alias}.json`);
  let ownerKeystore: KeystoreJson;
  try {
    ownerKeystore = JSON.parse(readFileSync(keystorePath, "utf8"));
  } catch (err) {
    fail(
      isJson,
      2,
      `cannot read keystore at ${keystorePath} (${(err as Error).message}). Did you run \`agent issue ${options.alias}\` first?`,
    );
  }

  // Resolve resolver address (always, even for plan-only — needed for
  // the publish-plan diff inside rotateAgent).
  const config = getNetworkConfig("mainnet"); // ENS lives on mainnet regardless of agent's chain
  const { fullName, node } = normalizeEnsName(options.ens, "mainnet");
  const resolverAddress = await getResolver(node, "mainnet");
  if (!resolverAddress) {
    fail(isJson, 1, `No resolver found for ${fullName}`);
  }

  // For --broadcast mode: resolve the signer up-front + build the send
  // callback. Use the same env-var convention as `agent publish` (#51):
  // ENS_PRIVATE_KEY OR --ledger.
  let signerAddress: `0x${string}` | null = null;
  let send: ((calldata: `0x${string}`, target: `0x${string}`) => Promise<`0x${string}`>) | undefined;
  if (options.broadcast) {
    if (options.ledger) {
      signerAddress = await getSignerAddressAsync(true, accountIndex);
      if (!isJson) {
        console.log(colors.green(`✓ Connected to Ledger`));
        console.log(colors.dim(`  Address: ${signerAddress}`));
      }
    } else {
      signerAddress = getSignerAddress();
      if (!signerAddress) {
        fail(isJson, 2, "ENS_PRIVATE_KEY not set (or use --ledger)");
      }
    }
    send = async (calldata, target) => {
      const wallet = await createChainWalletClient(
        config!.chainId,
        config!.rpcUrl,
        !!options.ledger,
        accountIndex,
      );
      if (!wallet || !wallet.account) {
        throw new Error("Wallet client unavailable");
      }
      const hash = await wallet.sendTransaction({
        account: wallet.account,
        chain: wallet.chain,
        to: target,
        data: calldata,
      });
      return hash;
    };
  }

  if (!isJson) {
    startSpinner(
      options.broadcast
        ? `Rotating ${colors.cyan(fullName)} (broadcast)...`
        : `Building rotation plan for ${colors.cyan(fullName)} (read-only)...`,
    );
  }

  let result: RotateResult;
  try {
    result = await rotateAgent({
      ensName: fullName,
      alias: options.alias,
      ownerKeystore,
      ownerPassword: keystorePwd!,
      chain,
      chainLabel,
      rpc,
      bundlerUrl,
      ipfsGateways: options.ipfsGateway,
      newPolicyVersion: options.policyVersion,
      newTtlHours: ttlHours,
      newGasCapWei: gasCapWei,
      pinataJwt: pinataJwt!,
      resolverAddress: resolverAddress!,
      broadcast: options.broadcast,
      send,
    });
  } catch (err) {
    stopSpinner();
    if (options.ledger) await closeLedger();
    fail(isJson, 1, (err as Error).message);
  }

  stopSpinner();

  // For --broadcast: wait for receipt(s). The publish multicall lands on
  // mainnet (ENS lives there), so polling MUST use the mainnet RPC, not
  // `options.rpc` which is the Base smart-account RPC. Codex P1 caught
  // this — passing the Base RPC to a chainId=1 client polls the wrong
  // chain for a mainnet tx and times out.
  if (options.broadcast && result!.publishPlan.txHashes && result!.publishPlan.txHashes.length > 0) {
    if (!isJson) startSpinner("Waiting for confirmations...");
    const client = createChainPublicClient(config!.chainId, config!.rpcUrl);
    for (const hash of result!.publishPlan.txHashes) {
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 2,
      });
      if (receipt.status !== "success") {
        stopSpinner();
        if (options.ledger) await closeLedger();
        fail(isJson, 1, `transaction ${hash} reverted`);
      }
    }
    stopSpinner();
  }

  if (options.ledger) await closeLedger();

  if (isJson) {
    console.log(JSON.stringify({ ...result!, signer: signerAddress }, null, 2));
  } else {
    printRotation(result!, signerAddress);
  }

  process.exitCode = 0;
  return result!;
}

function printRotation(r: RotateResult, signerAddress: `0x${string}` | null) {
  console.log();
  console.log(colors.bold("  Rotation Plan"));
  console.log(colors.dim("  ─────────────"));
  console.log(`    ENS name           : ${colors.cyan(r.ensName)}`);
  console.log(`    Alias              : ${r.alias} → ${colors.cyan(r.newSessionKeyArtifact)}`);
  console.log(`    Version bump       : ${colors.dim(r.fromVersion)} → ${colors.green(r.toVersion)}`);
  console.log(`    runtime-pubkey     : ${colors.dim(r.fromRuntimePubkey.slice(0, 10) + "…")} → ${colors.green(r.toRuntimePubkey.slice(0, 10) + "…")}`);
  console.log(`    new policy hash    : ${colors.green(r.newPolicy.hash)}`);
  console.log(`    new policy URI     : ${colors.dim(r.newPolicy.uri)}`);
  if (signerAddress) console.log(`    Signer             : ${colors.dim(signerAddress)}`);
  console.log();

  const plan = r.publishPlan;
  console.log(colors.bold("  Publish (4 records changed, 5 carried forward)"));
  console.log(colors.dim("  ────────────────────────────────────────────────"));
  for (const d of plan.diffs ?? []) {
    const rotated = ["runtime-pubkey", "delegation", "policy-hash", "policy-version"].includes(d.key);
    if (d.changed) {
      console.log(`    ${colors.yellow("●")} ${rotated ? colors.bold(d.key) : d.key}`);
      console.log(`      ${colors.dim("from:")} ${colors.dim((d.current ?? "(unset)").slice(0, 80))}`);
      console.log(`      ${colors.dim("  to:")} ${(d.next).slice(0, 80)}`);
    } else {
      console.log(`    ${colors.dim("·")} ${colors.dim(d.key.padEnd(20))} ${colors.dim("(unchanged)")}`);
    }
  }
  console.log();
  if (!r.broadcast) {
    console.log(colors.dim(`  No --broadcast — multicall would be sent to ${plan.resolver}.`));
    console.log(colors.dim(`  Re-run with ${colors.bold("--broadcast")} to send.`));
  } else if (plan.txHashes) {
    for (const h of plan.txHashes) {
      console.log(`  ${colors.green("✓ tx:")} ${h}`);
    }
    console.log();
    console.log(colors.dim(`  Verify with: ensemble agent verify ${r.ensName}`));
  }
  console.log();
}
