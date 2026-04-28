import { createWalletClient, http, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Batch, Signer } from "./index.js";

export interface CreateLocalSignerOptions {
  /** 0x-prefixed 32-byte private key. */
  privateKey: Hex;
  /** viem chain config (e.g. base, baseSepolia from "viem/chains"). */
  chain: Chain;
  /** RPC URL for the chain. */
  rpc: string;
}

/**
 * Create a Signer backed by a viem WalletClient over a private-key EOA.
 *
 * For early development and as a fallback when smart-account signers (Namera)
 * are unavailable. EOAs cannot atomically batch — `Batch.atomic === true` is
 * honored as best-effort sequential sends, with a console.warn if more than
 * one call would be lost. Use `createNameraSigner` for true atomic batches
 * via ERC-4337.
 */
export function createLocalSigner(opts: CreateLocalSignerOptions): Signer {
  const account = privateKeyToAccount(opts.privateKey);
  const walletClient = createWalletClient({
    account,
    chain: opts.chain,
    transport: http(opts.rpc),
  });

  return {
    address: account.address,
    async execute(batches: Batch[]): Promise<`0x${string}`> {
      // EOA limitation: no atomic batching. Warn loudly when callers expect
      // it so they don't silently rely on a guarantee they're not getting.
      const wantsAtomic = batches.some(
        (b) => b.atomic && b.calls.length > 1,
      );
      if (wantsAtomic) {
        console.warn(
          "[createLocalSigner] atomic batch requested but EOAs cannot batch atomically; " +
            "sending calls sequentially. Use createNameraSigner for atomic batches.",
        );
      }

      let lastHash: `0x${string}` | undefined;
      for (const batch of batches) {
        for (const call of batch.calls) {
          lastHash = await walletClient.sendTransaction({
            to: call.to,
            data: call.data,
            value: call.value,
            chain: opts.chain,
          });
        }
      }

      if (!lastHash) {
        throw new Error(
          "[createLocalSigner] execute() called with no calls to submit",
        );
      }
      return lastHash;
    },
  };
}
