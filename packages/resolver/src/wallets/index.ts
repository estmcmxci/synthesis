/**
 * Signer abstraction — uniform interface for "this address signs and broadcasts
 * a transaction." Two adapters live alongside this file:
 *
 *   - createLocalSigner — viem WalletClient over a private-key EOA
 *   - createNameraSigner — ZeroDev kernel account via @namera-ai/sdk
 *
 * The resolver itself is read-only; this module exists in packages/resolver
 * because that's where the schema + utilities live, but it performs no
 * resolution. Consuming applications (e.g. TrustSwap) wire signers + gate()
 * together to express "resolve who → decide allow → sign and broadcast."
 */

/** A logical batch of contract calls. EOAs ignore `atomic` and send sequentially. */
export interface Batch {
  chainId: number;
  /**
   * When true, all `calls` execute as a single onchain transaction. Smart-account
   * signers (Namera) honor this; EOA signers (local) emit a warning and fall
   * back to sequential sends.
   */
  atomic: boolean;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }>;
}

/** A signer over the {@link Batch} shape. Returned by adapter factories. */
export interface Signer {
  /** Address that signs and submits — EOA address for local, kernel account address for namera. */
  address: `0x${string}`;
  /**
   * Submit one or more batches; returns the broadcast tx hash (or user-op hash,
   * depending on the adapter's receipt handling).
   *
   * Multiple batches are processed in array order. Within a single batch, calls
   * are sent in order — and atomically as a single tx if `batch.atomic === true`
   * and the signer supports it.
   */
  execute(batches: Batch[]): Promise<`0x${string}`>;
}

export { createLocalSigner, type CreateLocalSignerOptions } from "./local.js";
export {
  createNameraSigner,
  type CreateNameraSignerOptions,
} from "./namera.js";
