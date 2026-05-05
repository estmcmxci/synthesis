import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveIdentity } from "./identity.js";
import { KNOWN_REGISTRIES, buildEnsip25Key } from "../utils/erc7930.js";

const BASE = KNOWN_REGISTRIES["8004-base"];

function records(map: Record<string, string>) {
  return async (_ens: string, key: string) => map[key] ?? null;
}

const happyOnChain = async () => ({
  tokenURI: "data:application/json;base64,eyJuYW1lIjoidGVzdCJ9",
  owner: "0xeb0ABB367540f90B57b3d5719fd2b9c740a15022",
});

test("auto-discovery — agent-ids index alone is enough to verify identity (regression for #43)", async () => {
  // The headline bug from #43: passing no knownAgentIds resulted in an empty
  // scan loop. With the agent-ids index in place, identity must verify.
  const ensip25Key = buildEnsip25Key(BASE.chainId, BASE.address, "24994");
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '["24994"]',
        [ensip25Key]: "1",
      }),
      verifyOnChain: happyOnChain,
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.agentId, "24994");
  assert.equal(result.registryChain, `eip155:${BASE.chainId}`);
});

test("auto-discovery still works when knownAgentIds is also supplied — caller IDs and indexed IDs are merged", async () => {
  const ensip25Key = buildEnsip25Key(BASE.chainId, BASE.address, "24994");
  const result = await resolveIdentity("emilemarcelagustin.eth", ["999", "24994"], {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '["24994"]',
        [ensip25Key]: "1",
      }),
      verifyOnChain: happyOnChain,
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.agentId, "24994");
});

test("malformed agent-ids JSON degrades to using only knownAgentIds, doesn't throw", async () => {
  const ensip25Key = buildEnsip25Key(BASE.chainId, BASE.address, "777");
  const result = await resolveIdentity("name.eth", ["777"], {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": "not-valid-json{",
        [ensip25Key]: "1",
      }),
      verifyOnChain: happyOnChain,
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.agentId, "777");
});

test("non-array agent-ids JSON also degrades — array is required", async () => {
  const result = await resolveIdentity("name.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '{"some": "object"}',
      }),
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.agentId, null);
});

test("array entries that aren't strings are filtered out", async () => {
  const ensip25Key = buildEnsip25Key(BASE.chainId, BASE.address, "5");
  const result = await resolveIdentity("name.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '[null, 42, "5", ""]',
        [ensip25Key]: "1",
      }),
      verifyOnChain: happyOnChain,
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.agentId, "5");
});

test("no agent-ids record and no knownAgentIds — returns verified:false cleanly", async () => {
  const result = await resolveIdentity("vitalik.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({}),
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.agentId, null);
  assert.equal(result.registryChain, null);
});

test("ENSIP-25 record present but on-chain verifyOnChain returns null — does not falsely verify (Codex P1)", async () => {
  // Defends against a stale/burned token id where the link record exists on
  // ENS but the ERC-8004 contract no longer recognizes the agent (or the RPC
  // is transiently failing). Without this gate, agent-ids auto-discovery
  // could elevate trust based purely on the ENS text record.
  const ensip25Key = buildEnsip25Key(BASE.chainId, BASE.address, "24994");
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '["24994"]',
        [ensip25Key]: "1",
      }),
      verifyOnChain: async () => ({ tokenURI: null, owner: null }),
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.agentId, null);
});

test("agent-ids index with a stale id followed by a fresh one — scan continues past the stale entry", async () => {
  const staleKey = buildEnsip25Key(BASE.chainId, BASE.address, "999");
  const freshKey = buildEnsip25Key(BASE.chainId, BASE.address, "24994");
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '["999", "24994"]',
        [staleKey]: "1",
        [freshKey]: "1",
      }),
      verifyOnChain: async (_reg, id) =>
        id === "24994"
          ? { tokenURI: "data:application/json;base64,e30=", owner: "0xeb0A" }
          : { tokenURI: null, owner: null },
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.agentId, "24994");
});

test("agent-ids has an ID but ENSIP-25 record is missing — does not falsely verify", async () => {
  // Defends against a stale agent-ids index that lists IDs whose ENSIP-25
  // text records have been deleted or never written.
  const result = await resolveIdentity("stale.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '["24994"]',
        // no ENSIP-25 key — discovery must not assume the link is live
      }),
      verifyOnChain: happyOnChain,
    },
  });
  assert.equal(result.verified, false);
});
