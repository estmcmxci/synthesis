import { z } from "zod";
import { TrustTier, TrustProfileSchema, type TrustProfile } from "./schema.js";
import { normalizeName } from "./utils/ens.js";

export const TrustPolicySchema = z.object({
  minTier: TrustTier.default("verified"),
  requireLineage: z.boolean().default(true),
  requireSig: z.boolean().default(true),
  allowSelf: z.boolean().default(true),
});
export type TrustPolicy = z.infer<typeof TrustPolicySchema>;

export const GateDecisionSchema = z.object({
  allow: z.boolean(),
  reason: z.string(),
  profile: TrustProfileSchema,
  policy: TrustPolicySchema,
});
export type GateDecision = z.infer<typeof GateDecisionSchema>;

const TIER_RANK: Record<z.infer<typeof TrustTier>, number> = {
  none: 0,
  registered: 1,
  discoverable: 2,
  verified: 3,
  full: 4,
};

function tierRank(t: z.infer<typeof TrustTier>): number {
  return TIER_RANK[t];
}

export function gate(
  profile: TrustProfile,
  policy: TrustPolicy,
  callerEns?: string,
): GateDecision {
  // 1. Deny: self disallowed.
  // When allowSelf is false, callerEns is REQUIRED — without it, the gate
  // can't determine self vs not-self and a missing flag would silently
  // bypass the protection. Treat missing-callerEns as a deny so the safety
  // control fails closed.
  //
  // When callerEns is present, compare normalized names — ENS is
  // case-insensitive per ENSIP-15, so a raw === would let "Alice.eth"
  // bypass an allowSelf:false gate against a profile resolved from
  // "alice.eth".
  if (!policy.allowSelf) {
    if (!callerEns) {
      return {
        allow: false,
        reason:
          "self-resolution check requires callerEns when allowSelf is false",
        profile,
        policy,
      };
    }
    const caller = normalizeName(callerEns);
    const target = normalizeName(profile.ensName);
    if (caller === target) {
      return {
        allow: false,
        reason: "self-resolution not permitted by policy",
        profile,
        policy,
      };
    }
  }

  // 2. Deny: tier below minimum
  if (tierRank(profile.trustScore) < tierRank(policy.minTier)) {
    return {
      allow: false,
      reason: `tier ${profile.trustScore} below required ${policy.minTier}`,
      profile,
      policy,
    };
  }

  // 3. Deny: signature invalid (only when manifest was found)
  if (
    policy.requireSig &&
    profile.manifest.found &&
    !profile.manifest.signatureValid
  ) {
    return {
      allow: false,
      reason: "manifest signature does not match current ENS owner",
      profile,
      policy,
    };
  }

  // 4. Deny: lineage broken
  if (policy.requireLineage && !profile.manifest.lineageIntact) {
    return {
      allow: false,
      reason: `manifest lineage broken at v${profile.manifest.lineageDepth}`,
      profile,
      policy,
    };
  }

  // 5. Allow
  return {
    allow: true,
    reason: `all gates passed at tier ${profile.trustScore}`,
    profile,
    policy,
  };
}
