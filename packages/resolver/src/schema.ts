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

export const IdentityResultSchema = z.object({
  verified: z.boolean(),
  registryAddress: z.string().nullable(),
  agentId: z.string().nullable(),
  registryChain: z.string().nullable(),
  tokenURI: z.string().nullable(),
  owner: z.string().nullable(),
});

export type IdentityResult = z.infer<typeof IdentityResultSchema>;

export const ContextResultSchema = z.object({
  found: z.boolean(),
  raw: z.string().nullable(),
  parsed: z.record(z.unknown()).nullable(),
  skillUrl: z.string().nullable(),
});

export type ContextResult = z.infer<typeof ContextResultSchema>;

export const AgentManifestSignatureSchema = z.object({
  scheme: z.string(),
  value: z.string(),
});

export const AgentManifestSchema = z.object({
  schema: z.string(),
  ensName: z.string(),
  version: z.string(),
  prev: z.string().nullable(),
  payload: z.record(z.unknown()),
  manifestHash: z.string().optional(),
  signature: AgentManifestSignatureSchema,
});

export type AgentManifest = z.infer<typeof AgentManifestSchema>;

export const ManifestResultSchema = z.object({
  found: z.boolean(),
  latestVersion: z.string().nullable(),
  lineageMode: z.string().nullable(),
  manifest: AgentManifestSchema.nullable(),
  signatureValid: z.boolean(),
  lineageDepth: z.number(),
  lineageIntact: z.boolean(),
});

export type ManifestResult = z.infer<typeof ManifestResultSchema>;

export const SkillResultSchema = z.object({
  found: z.boolean(),
  domainVerified: z.boolean(),
  content: z.string().nullable(),
  url: z.string().nullable(),
});

export type SkillResult = z.infer<typeof SkillResultSchema>;

export const TrustProfileSchema = z.object({
  ensName: z.string(),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable(),
  resolvedAt: z.number(),
  trustScore: TrustTier,

  // Resolution Layer 0: Personhood (World ID)
  personhood: PersonhoodResultSchema,

  // Resolution Layer 1: Identity (ENSIP-25)
  identity: IdentityResultSchema,

  // Resolution Layer 2: Discovery (ENSIP-26)
  context: ContextResultSchema,

  // Resolution Layer 3: Integrity (AIP)
  manifest: ManifestResultSchema,

  // Resolution Layer 4: Capability (DVS)
  skill: SkillResultSchema,
});

export type TrustProfile = z.infer<typeof TrustProfileSchema>;
