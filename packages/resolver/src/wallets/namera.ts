import { createSessionKeyClient } from "@namera-ai/sdk/session-key";
import { executeTransaction } from "@namera-ai/sdk/transaction";
import {
  createPublicClient,
  http,
  type Chain,
  type EntryPointVersion,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Batch, Signer } from "./index.js";

export interface CreateNameraSignerOptions {
  /**
   * Returns the base64-serialized session-key permission account string.
   *
   * IO is dependency-injected so the resolver stays free of Node-only deps
   * (allowing the package to be safely consumed by browser bundlers like
   * Next.js webpack). Callers in Node typically pass:
   *   `() => readFile(path, "utf-8").then(s => s.trim())`
   */
  readSessionKey: () => Promise<string>;
  /** 0x-prefixed 32-byte private key for the session signer (NOT the owner key). */
  sessionKeyPrivateKey: Hex;
  /** ERC-4337 bundler URL for the chain (Pimlico/Alchemy). */
  bundlerUrl: string;
  /** viem chain config (e.g. base from "viem/chains"). */
  chain: Chain;
  /** RPC URL for the public client. */
  rpc: string;
  /** ERC-4337 entrypoint version. Defaults to "0.7". */
  entrypointVersion?: EntryPointVersion;
  /**
   * ZeroDev kernel version (e.g. KERNEL_V3_3 from @zerodev/sdk/constants).
   * Must match what the session key was issued for.
   */
  // biome-ignore lint/suspicious/noExplicitAny: GetKernelVersion is a deeply
  // conditional generic; we pass through to namera, which validates at runtime.
  kernelVersion: any;
}

/**
 * Create a Signer backed by a Namera session-key client (ZeroDev kernel account
 * via @namera-ai/sdk).
 *
 * **Execution-only.** This adapter consumes a previously-issued, serialized
 * session key plus the session signer's private key. It does NOT require or
 * instantiate the owner key — the owner key lives in an encrypted keystore
 * off-droplet, used only at session-key issuance time (a one-time ceremony
 * the consuming application performs separately).
 *
 * **Policy-agnostic.** Onchain policies (call / gas / rate-limit / timestamp)
 * are baked into the session key during issuance. What this signer can and
 * cannot do is determined by the validator state on chain, not by anything
 * here. Consuming apps choose their policies during issuance.
 *
 * `execute(batches)` forwards to `executeTransaction` and returns the LAST
 * batch's onchain transaction hash (extracted from its UserOperationReceipt).
 * Throws if every batch failed to broadcast.
 */
export async function createNameraSigner(
  opts: CreateNameraSignerOptions,
): Promise<Signer> {
  const serializedAccount = (await opts.readSessionKey()).trim();
  const client = createPublicClient({
    chain: opts.chain,
    transport: http(opts.rpc),
  });
  const signer = privateKeyToAccount(opts.sessionKeyPrivateKey);

  const sessionKeyClient = await createSessionKeyClient({
    type: "ecdsa",
    signer,
    client,
    serializedAccount,
    bundlerTransport: http(opts.bundlerUrl),
    chain: opts.chain,
    entrypointVersion: opts.entrypointVersion ?? "0.7",
    kernelVersion: opts.kernelVersion,
    // biome-ignore lint/suspicious/noExplicitAny: heavy generic narrowing —
    // namera's createSessionKeyClient requires param-tuple inference that
    // doesn't survive our thinner wrapper signature.
  } as any);

  return {
    address: sessionKeyClient.account.address,
    async execute(batches: Batch[]): Promise<`0x${string}`> {
      // Our Batch shape matches namera's: { chainId, atomic, calls: { to, data, value }[] }.
      const receipts = await executeTransaction({
        batches,
        clients: [sessionKeyClient],
      });

      // Return the LAST successful receipt's onchain tx hash. Walk backwards
      // so the most recent send wins (matches the local signer's contract).
      for (let i = receipts.length - 1; i >= 0; i--) {
        const receipt = receipts[i];
        if (receipt) {
          return receipt.receipt.transactionHash;
        }
      }
      throw new Error(
        "[createNameraSigner] all batches failed to broadcast",
      );
    },
  };
}
