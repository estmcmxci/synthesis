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

/**
 * Adapter8004 binding cross-check result. `null` when the agent is not
 * adapter-managed (legacy direct registration, or no known adapter on the
 * registry's chain) — existence-only verification applies. `passed: false`
 * with a `reason` means an adapter was consulted but the binding could not
 * be verified (e.g. adapter unreachable); a binding that resolves to a
 * *different* token than the ENS name's wrapped NameWrapper token rejects
 * the (registry, agentId) pair outright and never surfaces here.
 */
export const IdentityBindingSchema = z.object({
  passed: z.boolean(),
  adapterAddress: z.string(),
  tokenContract: z.string().nullable(),
  tokenId: z.string().nullable(),
  reason: z.string().nullable(),
});

export type IdentityBinding = z.infer<typeof IdentityBindingSchema>;

export const IdentityResultSchema = z.object({
  verified: z.boolean(),
  registryAddress: z.string().nullable(),
  agentId: z.string().nullable(),
  registryChain: z.string().nullable(),
  tokenURI: z.string().nullable(),
  owner: z.string().nullable(),
  // Optional so pre-adapter payloads still parse (additive change).
  binding: IdentityBindingSchema.nullable().optional(),
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
