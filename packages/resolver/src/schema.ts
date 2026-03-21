import { z } from "zod";

export const TrustTier = z.enum([
  "none",
  "registered",
  "discoverable",
  "verified",
  "full",
]);

export type TrustTier = z.infer<typeof TrustTier>;

export const AgentBookNetwork = z.enum(["base", "world", "base-sepolia"]);

export type AgentBookNetwork = z.infer<typeof AgentBookNetwork>;

export const PersonhoodResultSchema = z.object({
  verified: z.boolean(),
  nullifierHash: z.string().nullable(),
  network: AgentBookNetwork.nullable(),
  agentBookAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .nullable(),
});

export type PersonhoodResult = z.infer<typeof PersonhoodResultSchema>;

export const TrustProfileSchema = z.object({
  name: z.string(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tier: TrustTier,
  personhood: PersonhoodResultSchema,
  ensRecords: z.record(z.string()).optional(),
  agentId: z.string().optional(),
  resolvedAt: z.number(),
});

export type TrustProfile = z.infer<typeof TrustProfileSchema>;
