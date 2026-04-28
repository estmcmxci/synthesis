import { z } from "zod";
import { TrustTier, TrustProfileSchema, type TrustProfile } from "./schema.js";

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
  // 1. Deny: self disallowed
  if (!policy.allowSelf && callerEns === profile.ensName) {
    return {
      allow: false,
      reason: "self-resolution not permitted by policy",
      profile,
      policy,
    };
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
