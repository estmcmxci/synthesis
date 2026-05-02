import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEnsip25Key,
  parseEnsip25Key,
  encodeErc7930Address,
  decodeErc7930Address,
  KNOWN_REGISTRIES,
} from "./erc7930.js";

test("ENSIP-25 round-trip across known registries and a range of agent IDs", () => {
  const ids = ["1", "42", "999999", "0xabc", "0"];
  for (const reg of Object.values(KNOWN_REGISTRIES)) {
    for (const id of ids) {
      const key = buildEnsip25Key(reg.chainId, reg.address, id);
      const parsed = parseEnsip25Key(key);
      assert.deepEqual(parsed, {
        chainId: reg.chainId,
        registryAddress: reg.address.toLowerCase(),
        agentId: id,
      });
    }
  }
});

test("buildEnsip25Key uses the spec format agent-registration[0x..][id]", () => {
  const reg = KNOWN_REGISTRIES["8004-base"];
  const key = buildEnsip25Key(reg.chainId, reg.address, "7");
  assert.match(key, /^agent-registration\[0x[0-9a-f]+\]\[7\]$/);
});

test("parseEnsip25Key tolerates the optional 0x prefix on the address payload", () => {
  const reg = KNOWN_REGISTRIES["8004-base"];
  const encoded = encodeErc7930Address(reg.chainId, reg.address);
  const withPrefix = `agent-registration[0x${encoded}][9]`;
  const withoutPrefix = `agent-registration[${encoded}][9]`;
  assert.deepEqual(parseEnsip25Key(withPrefix), parseEnsip25Key(withoutPrefix));
});

test("ERC-7930 encode/decode round-trip for several chain IDs", () => {
  const cases = [
    { chainId: 1, addr: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" },
    { chainId: 8453, addr: "0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4" },
    { chainId: 480, addr: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA" },
    { chainId: 11155111, addr: "0x0000000000000000000000000000000000000001" },
  ];
  for (const c of cases) {
    const encoded = encodeErc7930Address(c.chainId, c.addr);
    const decoded = decodeErc7930Address(encoded);
    assert.deepEqual(decoded, {
      chainId: c.chainId,
      address: c.addr.toLowerCase(),
    });
  }
});
