/**
 * `ensemble agent publish <ens-name>` — CLI presenter.
 *
 * Broadcasts the 9 ENSIP-64 records onto an ENS name. First PR in the
 * §7 sequence that mutates mainnet state, so `--broadcast` is the only
 * opt-in flag — absence = print plan + diff and exit. There is no
 * `--dry-run` flag because dry-run IS the default.
 *
 * One transaction by default (multicall over 9 setText calls). Falls
 * back to 9 sequential transactions with `--no-multicall` for resolvers
 * that don't support multicall.
 */

import { readFileSync } from "node:fs";
import colors from "yoctocolors";
import { encodeFunctionData, type Address } from "viem";
import {
  publishAgentRecords,
  type AgentPublishRecords,
  type PublishPlan,
} from "@synthesis/resolver";
import {
  startSpinner,
  stopSpinner,
  normalizeEnsName,
  getResolver,
  setTextRecordOnChain,
  getSignerAddress,
  getSignerAddressAsync,
  closeLedger,
  getNetworkConfig,
} from "../utils";
import { createChainPublicClient, createChainWalletClient } from "../utils/viem";

export interface AgentPublishCliOptions {
  name: string;
  schema?: string;
  runtimePubkey?: string;
  runtimeStatus?: string;
  kernelWallet?: string;
  agentEndpointWeb?: string;
  delegation?: string;
  policyHash?: string;
  policyVersion?: string;
  class?: string;
  fromPinOutput?: string[];
  broadcast?: boolean;
  noMulticall?: boolean;
  legacyAliases?: boolean;
  ledger?: boolean;
  accountIndex?: string;
  network?: string;
  rpc?: string;
  format?: string;
}

interface PinOutputShape {
  schemaUri?: string;
  delegationUri?: string;
  policyHash?: string;
}

function isJsonFlag(): boolean {
  return process.argv.some(
    (arg, i, arr) =>
      arg === "--format=json" ||
      (arg === "--format" && arr[i + 1] === "json") ||
      (arg === "-f" && arr[i + 1] === "json"),
  );
}

/**
 * Read each --from-pin-output file, return a merged set of fields. Last
 * file wins per field. Fields are read by NAME — no relpath
 * pattern-matching at this layer (publish doesn't know about file
 * conventions; that's `agent pin`'s job).
 */
/**
 * Lenient JSON parser for --from-pin-output. The incur framework
 * auto-prints the run() return value as JSON on stdout when --format json
 * is set, so a raw `agent pin --format json > pin.json` ends up containing
 * TWO concatenated JSON objects (the command's own console.log + incur's
 * auto-render). Parse just the first complete object so the operator
 * doesn't have to pipe through `jq -s '.[0]'`.
 */
function parseFirstJsonObject(raw: string): unknown {
  // Fast path: file is a single object.
  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }
  // Walk the string and balance braces (respecting strings + escapes) to
  // find the end of the first complete top-level object.
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        return JSON.parse(raw.slice(start, i + 1));
      }
    }
  }
  throw new Error("no complete JSON object found in pin-output file");
}

function mergePinOutputs(paths: string[]): PinOutputShape {
  const out: PinOutputShape = {};
  for (const p of paths) {
    const raw = readFileSync(p, "utf8");
    const parsed = parseFirstJsonObject(raw) as PinOutputShape;
    if (parsed.schemaUri) out.schemaUri = parsed.schemaUri;
    if (parsed.delegationUri) out.delegationUri = parsed.delegationUri;
    if (parsed.policyHash) out.policyHash = parsed.policyHash;
  }
  return out;
}

/**
 * Merge pin-output values + explicit CLI flags. Explicit flags always
 * win over pin-output values (so the operator can override a single
 * field without re-pinning).
 */
export function resolveRecords(
  options: AgentPublishCliOptions,
  pin: PinOutputShape,
): { records: Partial<AgentPublishRecords>; missingFromPin: string[] } {
  const missingFromPin: string[] = [];
  const records: Partial<AgentPublishRecords> = {
    class: options.class ?? "Agent",
    "runtime-status": (options.runtimeStatus ?? "active") as AgentPublishRecords["runtime-status"],
  };
  if (options.runtimePubkey) records["runtime-pubkey"] = options.runtimePubkey;
  if (options.kernelWallet) records["kernel-wallet"] = options.kernelWallet;
  if (options.agentEndpointWeb)
    records["agent-endpoint[web]"] = options.agentEndpointWeb;
  if (options.policyVersion) records["policy-version"] = options.policyVersion;

  // schema: explicit flag > pin schemaUri
  records.schema = options.schema ?? pin.schemaUri;
  // delegation: explicit flag > pin delegationUri
  records.delegation = options.delegation ?? pin.delegationUri;
  // policy-hash: explicit flag > pin policyHash
  records["policy-hash"] = options.policyHash ?? pin.policyHash;

  // If --from-pin-output was used and the operator was relying on it for
  // schema/delegation but the file didn't carry the named field, fail
  // loud — this is the fail-loud behavior the amendment requires.
  if (
    options.fromPinOutput &&
    options.fromPinOutput.length > 0 &&
    !options.schema &&
    !pin.schemaUri
  ) {
    missingFromPin.push(
      "schemaUri (pass --schema explicitly, or pin a tree containing schemas/agent-schema-vN.json)",
    );
  }
  if (
    options.fromPinOutput &&
    options.fromPinOutput.length > 0 &&
    !options.delegation &&
    options.policyHash === undefined &&
    pin.policyHash !== undefined &&
    !pin.delegationUri
  ) {
    missingFromPin.push(
      "delegationUri (the pin output has policyHash but no delegationUri — pass --delegation explicitly or re-pin without --policy -)",
    );
  }
  return { records, missingFromPin };
}

export async function agentPublish(
  options: AgentPublishCliOptions,
): Promise<PublishPlan> {
  const isJson = options.format === "json" || isJsonFlag();
  const network = options.network ?? "mainnet";
  const accountIndex = options.accountIndex ? parseInt(options.accountIndex, 10) : 0;

  // 1) Merge --from-pin-output with explicit flags
  const pin = options.fromPinOutput?.length
    ? mergePinOutputs(options.fromPinOutput)
    : {};
  const { records, missingFromPin } = resolveRecords(options, pin);

  if (missingFromPin.length > 0) {
    const message =
      `--from-pin-output supplied but missing required field(s):\n` +
      missingFromPin.map((m) => `  - ${m}`).join("\n");
    if (isJson) console.log(JSON.stringify({ error: message }));
    else console.error(colors.red(message));
    process.exitCode = 2;
    throw new Error(message);
  }

  // 2) Resolve resolver address for this name (read-only)
  const config = getNetworkConfig(network);
  const { fullName, node } = normalizeEnsName(options.name, network);
  const resolverAddress = await getResolver(node, network);
  if (!resolverAddress) {
    const message = `No resolver found for ${fullName} on ${network}`;
    if (isJson) console.log(JSON.stringify({ error: message }));
    else console.error(colors.red(message));
    process.exitCode = 1;
    throw new Error(message);
  }

  const client = createChainPublicClient(config.chainId, options.rpc ?? config.rpcUrl);

  // 3) For broadcast mode, wire the send callback up to the existing
  // CLI infra (private-key OR Ledger). For non-broadcast, the callback
  // is never invoked, but we resolve the signer up-front so the
  // operator gets the address printed in the plan output.
  let signerAddress: Address | null = null;
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
        const message = "ENS_PRIVATE_KEY not set (or use --ledger)";
        if (isJson) console.log(JSON.stringify({ error: message }));
        else console.error(colors.red(message));
        process.exitCode = 2;
        throw new Error(message);
      }
    }
  }

  let send: ((calldata: `0x${string}`, target: Address) => Promise<`0x${string}`>) | undefined;
  if (options.broadcast) {
    send = async (calldata, target) => {
      const wallet = await createChainWalletClient(
        config.chainId,
        options.rpc ?? config.rpcUrl,
        !!options.ledger,
        accountIndex,
      );
      if (!wallet || !wallet.account) {
        throw new Error("Wallet client unavailable");
      }
      // Send a raw transaction with the encoded calldata (multicall blob
      // OR a single setText blob — both target the resolver). We use
      // sendTransaction rather than writeContract so this code path is
      // shared between multicall and per-tx modes without re-encoding.
      const hash = await wallet.sendTransaction({
        account: wallet.account,
        chain: wallet.chain,
        to: target,
        data: calldata,
      });
      return hash;
    };
  }

  // 4) Plan + (optionally) broadcast
  if (!isJson) {
    startSpinner(
      options.broadcast
        ? `Broadcasting to ${colors.cyan(fullName)}...`
        : `Building plan for ${colors.cyan(fullName)} (read-only, no broadcast)...`,
    );
  }

  let plan: PublishPlan;
  try {
    plan = await publishAgentRecords(
      fullName,
      records as AgentPublishRecords,
      client,
      {
        resolverAddress,
        multicall: !options.noMulticall,
        legacyAliases: options.legacyAliases,
        broadcast: options.broadcast,
        send,
      },
    );
  } catch (err) {
    stopSpinner();
    const message = (err as Error).message;
    if (isJson) console.log(JSON.stringify({ error: message }));
    else console.error(colors.red(message));
    process.exitCode = 2; // validation errors are input errors
    if (options.ledger) await closeLedger();
    throw err;
  }

  stopSpinner();

  // 5) Wait for confirmations + report
  if (options.broadcast && plan.txHashes && plan.txHashes.length > 0) {
    if (!isJson) startSpinner("Waiting for confirmations...");
    for (const hash of plan.txHashes) {
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 2,
      });
      if (receipt.status !== "success") {
        stopSpinner();
        const message = `transaction ${hash} reverted`;
        if (isJson) {
          console.log(JSON.stringify({ ...plan, error: message }, null, 2));
        } else {
          console.error(colors.red(`✗ ${message}`));
        }
        process.exitCode = 1;
        if (options.ledger) await closeLedger();
        throw new Error(message);
      }
    }
    stopSpinner();
  }

  if (options.ledger) await closeLedger();

  if (isJson) {
    console.log(
      JSON.stringify(
        { ...plan, signer: signerAddress, network },
        null,
        2,
      ),
    );
  } else {
    printPlan(plan, signerAddress, fullName, options);
  }

  process.exitCode = 0;
  return plan;
}

function printPlan(
  plan: PublishPlan,
  signerAddress: Address | null,
  fullName: string,
  options: AgentPublishCliOptions,
) {
  console.log();
  console.log(colors.bold("  Publish Plan"));
  console.log(colors.dim("  ────────────"));
  console.log(`    ENS name        : ${colors.cyan(fullName)}`);
  console.log(`    Resolver        : ${colors.dim(plan.resolver)}`);
  if (signerAddress) console.log(`    Signer          : ${colors.dim(signerAddress)}`);
  console.log(
    `    Mode            : ${
      options.noMulticall
        ? `${colors.yellow(plan.records.length.toString())} sequential transactions`
        : colors.green("1 multicall transaction")
    }`,
  );
  console.log(`    Records         : ${plan.records.length}`);
  console.log();
  console.log(colors.bold("  Diff"));
  console.log(colors.dim("  ────"));
  for (const d of plan.diffs ?? []) {
    const marker = d.changed ? colors.yellow("●") : colors.dim("·");
    const keyLabel = (d.key.padEnd(30)).slice(0, 30);
    if (d.changed) {
      const oldDisplay = d.current ?? colors.dim("(unset)");
      console.log(`    ${marker} ${colors.bold(keyLabel)}`);
      console.log(`      ${colors.dim("from:")} ${colors.dim(typeof oldDisplay === "string" ? truncate(oldDisplay) : oldDisplay)}`);
      console.log(`      ${colors.dim("  to:")} ${truncate(d.next)}`);
    } else {
      console.log(`    ${marker} ${colors.dim(keyLabel)} ${colors.dim("(unchanged)")}`);
    }
  }
  console.log();
  if (!plan.broadcast) {
    const target = options.noMulticall ? "each setText call" : "the multicall blob";
    console.log(colors.dim(`  No --broadcast — ${target} would be sent to ${plan.resolver}.`));
    console.log(colors.dim(`  Re-run with ${colors.bold("--broadcast")} to send.`));
  } else if (plan.txHashes) {
    for (const h of plan.txHashes) {
      console.log(`  ${colors.green("✓ tx:")} ${h}`);
    }
    console.log();
    console.log(
      colors.dim(`  Verify with: ensemble agent verify ${fullName}`),
    );
  }
  console.log();
}

function truncate(s: string, n = 80): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
