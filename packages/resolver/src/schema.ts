import { z } from "zod";

export const TrustTier = z.enum([
  "none",
  "registered",
  "discoverable",
  "verified",
  "full",
]);

export type TrustTier = z.infer<typeof TrustTier>;

export const TrustProfileSchema = z.object({
  name: z.string(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tier: TrustTier,
  ensRecords: z.record(z.string()).optional(),
  personhood: z.boolean().optional(),
  agentId: z.string().optional(),
  resolvedAt: z.number(),
});

export type TrustProfile = z.infer<typeof TrustProfileSchema>;
