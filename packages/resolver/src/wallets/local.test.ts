import { test } from "node:test";
import assert from "node:assert/strict";
import { base } from "viem/chains";
import { createLocalSigner } from "./local.js";

// Hardhat default account 0 — well-known test key, never use on mainnet.
const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266" as const;

test("createLocalSigner derives address from private key", () => {
  const signer = createLocalSigner({
    privateKey: TEST_PRIVATE_KEY,
    chain: base,
    rpc: "http://localhost:8545",
  });
  assert.equal(signer.address.toLowerCase(), TEST_ADDRESS.toLowerCase());
});

test("createLocalSigner returns a Signer with address + execute()", () => {
  const signer = createLocalSigner({
    privateKey: TEST_PRIVATE_KEY,
    chain: base,
    rpc: "http://localhost:8545",
  });
  assert.match(signer.address, /^0x[a-fA-F0-9]{40}$/);
  assert.equal(typeof signer.execute, "function");
});

// Note: end-to-end execute(batches) testing requires a live RPC or a more
// involved viem transport mock. Covered by TrustSwap Phase 0's live
// USDC→WETH broadcast on Base (see plans/trust-gated-swap.md). Here we
// test only what's verifiable without network I/O.
