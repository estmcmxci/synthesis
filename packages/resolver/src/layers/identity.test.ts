import { test } from "node:test";
import assert from "node:assert/strict";
import { namehash } from "viem";
import { resolveIdentity, type AdapterBindingProbe } from "./identity.js";
import { KNOWN_REGISTRIES, KNOWN_ADAPTERS, buildEnsip25Key } from "../utils/erc7930.js";
import { NAME_WRAPPER_ADDRESS } from "../utils/ens.js";

const BASE = KNOWN_REGISTRIES["8004-base"];
const BASE_ADAPTER = KNOWN_ADAPTERS[BASE.chainId];

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

test("testHooks without verifyOnChain — never hits the network, returns verified:false (Codex P2)", async () => {
  // The testHooks contract guarantees no live network calls. A partial
  // stub (readTextRecord only, no verifyOnChain) must not silently fall
  // back to real RPC the moment an ENSIP-25 record matches. Default
  // behavior: treat the missing hook as if on-chain verification failed
  // (null fields), so the caller gets a clean verified:false.
  const ensip25Key = buildEnsip25Key(BASE.chainId, BASE.address, "24994");
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '["24994"]',
        [ensip25Key]: "1",
      }),
      // verifyOnChain intentionally omitted
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.agentId, null);
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

// =============================================================================
// Adapter8004 binding cross-check
// =============================================================================

/** On-chain existence check where the adapter is the registry owner of the
 * agent token — the normal state for adapter-registered agents. */
const adapterOwnedOnChain = async () => ({
  tokenURI: "data:application/json;base64,eyJuYW1lIjoidGVzdCJ9",
  owner: BASE_ADAPTER,
});

function boundTo(name: string, overrides: Partial<Extract<AdapterBindingProbe, { outcome: "bound" }>> = {}) {
  return async (): Promise<AdapterBindingProbe> => ({
    outcome: "bound",
    identityRegistry: BASE.address,
    tokenContract: NAME_WRAPPER_ADDRESS,
    tokenId: BigInt(namehash(name)).toString(),
    ...overrides,
  });
}

function claimFixture(agentId: string) {
  return records({
    "agent-ids": `["${agentId}"]`,
    [buildEnsip25Key(BASE.chainId, BASE.address, agentId)]: "1",
  });
}

test("adapter binding matches NameWrapper + namehash(name) — binding.passed true", async () => {
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: claimFixture("24994"),
      verifyOnChain: adapterOwnedOnChain,
      probeBinding: boundTo("emilemarcelagustin.eth"),
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.agentId, "24994");
  assert.equal(result.binding?.passed, true);
  assert.equal(result.binding?.adapterAddress, BASE_ADAPTER);
  assert.equal(result.binding?.tokenContract, NAME_WRAPPER_ADDRESS);
  assert.equal(result.binding?.tokenId, BigInt(namehash("emilemarcelagustin.eth")).toString());
});

test("TRUST GAP: claiming an agentId bound to a DIFFERENT name is rejected, not existence-verified", async () => {
  // The attack #65 closes: attacker has text-record write access to
  // attacker.eth and claims an agentId that the adapter provably bound to
  // victim.eth's wrapped token. Existence-only verification would pass this;
  // the binding cross-check must reject it outright.
  const result = await resolveIdentity("attacker.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: claimFixture("24994"),
      verifyOnChain: adapterOwnedOnChain,
      probeBinding: boundTo("victim.eth"),
    },
  });
  assert.equal(result.verified, false);
  assert.equal(result.agentId, null);
  assert.equal(result.binding, null);
});

test("adapter binding to a non-NameWrapper token contract is rejected for the claiming name", async () => {
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: claimFixture("24994"),
      verifyOnChain: adapterOwnedOnChain,
      probeBinding: boundTo("emilemarcelagustin.eth", {
        tokenContract: "0x1111111111111111111111111111111111111111",
      }),
    },
  });
  assert.equal(result.verified, false);
});

test("unbound (bindingOf reverts) — legacy direct registration keeps existence-only verification", async () => {
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: claimFixture("24994"),
      verifyOnChain: happyOnChain,
      probeBinding: async () => ({ outcome: "unbound" }),
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.binding, null);
});

test("adapter unreachable — degrades to existence-only with binding.passed false, does not reject", async () => {
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: claimFixture("24994"),
      verifyOnChain: happyOnChain,
      probeBinding: async () => ({ outcome: "unavailable" }),
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.binding?.passed, false);
  assert.match(result.binding?.reason ?? "", /unreachable/);
});

test("testHooks without probeBinding — no network, defaults to unavailable (existence-only)", async () => {
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: claimFixture("24994"),
      verifyOnChain: happyOnChain,
      // probeBinding intentionally omitted
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.binding?.passed, false);
});

test("adapter identityRegistry mismatch — binding not comparable, degrades without rejecting", async () => {
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: claimFixture("24994"),
      verifyOnChain: adapterOwnedOnChain,
      probeBinding: boundTo("emilemarcelagustin.eth", {
        identityRegistry: "0x2222222222222222222222222222222222222222",
      }),
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.binding?.passed, false);
  assert.match(result.binding?.reason ?? "", /identityRegistry/);
});

test("agent token not held by the adapter — binding not authoritative, degrades without rejecting", async () => {
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: claimFixture("24994"),
      // owner is an EOA, not the adapter
      verifyOnChain: happyOnChain,
      probeBinding: boundTo("emilemarcelagustin.eth"),
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.binding?.passed, false);
  assert.match(result.binding?.reason ?? "", /not the adapter/);
});

test("no adapter configured for the chain — binding is null, legacy behavior", async () => {
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    adapters: {},
    testHooks: {
      readTextRecord: claimFixture("24994"),
      verifyOnChain: happyOnChain,
      probeBinding: async () => {
        throw new Error("must not be called when no adapter is configured");
      },
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.binding, null);
});

test("mismatch-rejected id is skipped but a later correctly-bound id still verifies", async () => {
  const wrongKey = buildEnsip25Key(BASE.chainId, BASE.address, "111");
  const rightKey = buildEnsip25Key(BASE.chainId, BASE.address, "222");
  const result = await resolveIdentity("emilemarcelagustin.eth", undefined, {
    registries: [{ chainId: BASE.chainId, address: BASE.address }],
    testHooks: {
      readTextRecord: records({
        "agent-ids": '["111", "222"]',
        [wrongKey]: "1",
        [rightKey]: "1",
      }),
      verifyOnChain: adapterOwnedOnChain,
      probeBinding: async (_reg, agentId) =>
        agentId === "222"
          ? {
              outcome: "bound",
              identityRegistry: BASE.address,
              tokenContract: NAME_WRAPPER_ADDRESS,
              tokenId: BigInt(namehash("emilemarcelagustin.eth")).toString(),
            }
          : {
              outcome: "bound",
              identityRegistry: BASE.address,
              tokenContract: NAME_WRAPPER_ADDRESS,
              tokenId: BigInt(namehash("victim.eth")).toString(),
            },
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.agentId, "222");
  assert.equal(result.binding?.passed, true);
});
