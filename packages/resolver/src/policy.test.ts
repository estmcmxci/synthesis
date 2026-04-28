import { test } from "node:test";
import assert from "node:assert/strict";
import { gate, type TrustPolicy } from "./policy.js";
import { type TrustProfile } from "./schema.js";

const defaultManifest: TrustProfile["manifest"] = {
  found: false,
  latestVersion: null,
  lineageMode: null,
  manifest: null,
  signatureValid: true,
  lineageDepth: 0,
  lineageIntact: true,
};

function makeProfile(overrides: Partial<TrustProfile> = {}): TrustProfile {
  return {
    ensName: "test.eth",
    address: null,
    resolvedAt: 0,
    trustScore: "full",
    personhood: {
      verified: false,
      nullifierHash: null,
      network: null,
      agentBookAddress: null,
    },
    identity: {
      verified: false,
      registryAddress: null,
      agentId: null,
      registryChain: null,
      tokenURI: null,
      owner: null,
    },
    context: { found: false, raw: null, parsed: null, skillUrl: null },
    manifest: defaultManifest,
    skill: { found: false, domainVerified: false, content: null, url: null },
    ...overrides,
  };
}

const strictPolicy: TrustPolicy = {
  minTier: "full",
  requireLineage: true,
  requireSig: true,
  allowSelf: false,
};

test("denies when caller is self and allowSelf is false", () => {
  const profile = makeProfile({ ensName: "alice.eth" });
  const decision = gate(profile, strictPolicy, "alice.eth");
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "self-resolution not permitted by policy");
});

test("denies when caller is self with different casing (ENSIP-15 normalization)", () => {
  const profile = makeProfile({ ensName: "alice.eth" });
  const decision = gate(profile, strictPolicy, "Alice.eth");
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "self-resolution not permitted by policy");
});

test("denies when allowSelf is false but callerEns is missing (fail-closed)", () => {
  const profile = makeProfile({ ensName: "alice.eth" });
  // No third argument — callerEns is undefined. The self-check cannot
  // run, so the gate must deny rather than silently bypass.
  const decision = gate(profile, strictPolicy);
  assert.equal(decision.allow, false);
  assert.equal(
    decision.reason,
    "self-resolution check requires callerEns when allowSelf is false",
  );
});

test("denies when trust tier is below required minTier", () => {
  const profile = makeProfile({ trustScore: "registered" });
  const policy: TrustPolicy = {
    minTier: "verified",
    requireLineage: false,
    requireSig: false,
    allowSelf: true,
  };
  const decision = gate(profile, policy);
  assert.equal(decision.allow, false);
  assert.match(decision.reason, /tier registered below required verified/);
});

test("denies when manifest signature is invalid", () => {
  const profile = makeProfile({
    manifest: { ...defaultManifest, found: true, signatureValid: false },
  });
  const policy: TrustPolicy = {
    minTier: "none",
    requireLineage: false,
    requireSig: true,
    allowSelf: true,
  };
  const decision = gate(profile, policy);
  assert.equal(decision.allow, false);
  assert.equal(
    decision.reason,
    "manifest signature does not match current ENS owner",
  );
});

test("denies when manifest lineage is broken", () => {
  const profile = makeProfile({
    manifest: {
      ...defaultManifest,
      found: true,
      lineageIntact: false,
      lineageDepth: 2,
    },
  });
  const policy: TrustPolicy = {
    minTier: "none",
    requireLineage: true,
    requireSig: false,
    allowSelf: true,
  };
  const decision = gate(profile, policy);
  assert.equal(decision.allow, false);
  assert.match(decision.reason, /manifest lineage broken at v2/);
});

test("allows when all gates pass", () => {
  const profile = makeProfile({
    ensName: "alice.eth",
    trustScore: "full",
    manifest: {
      ...defaultManifest,
      found: true,
      signatureValid: true,
      lineageIntact: true,
    },
  });
  const policy: TrustPolicy = {
    minTier: "verified",
    requireLineage: true,
    requireSig: true,
    allowSelf: false,
  };
  const decision = gate(profile, policy, "bob.eth");
  assert.equal(decision.allow, true);
  assert.equal(decision.reason, "all gates passed at tier full");
});
