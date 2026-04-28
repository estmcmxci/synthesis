import { test } from "node:test";
import assert from "node:assert/strict";
import { base } from "viem/chains";
import { createNameraSigner } from "./namera.js";

test("createNameraSigner is exported as an async function", () => {
  assert.equal(typeof createNameraSigner, "function");
  // Async fns have a `then`-less return at definition time; the call below
  // returns a Promise. We don't invoke with valid params here — we just
  // confirm the export shape.
  assert.equal(createNameraSigner.constructor.name, "AsyncFunction");
});

test("createNameraSigner propagates errors from readSessionKey", async () => {
  await assert.rejects(
    () =>
      createNameraSigner({
        readSessionKey: () => Promise.reject(new Error("stub: keystore unavailable")),
        sessionKeyPrivateKey:
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        bundlerUrl: "http://localhost:4337",
        chain: base,
        rpc: "http://localhost:8545",
        kernelVersion: "0.3.1",
      }),
    /keystore unavailable/,
  );
});

// Note: end-to-end execute(batches) testing requires a real ZeroDev kernel
// account, a funded session key, and a live ERC-4337 bundler. Covered by
// TrustSwap Phase 0's live USDC→WETH broadcast on Base (see
// plans/trust-gated-swap.md). Here we test only the construction-time
// surface that's verifiable without on-chain state.
