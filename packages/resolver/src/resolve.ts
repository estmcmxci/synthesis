/**
 * Trust Resolution Layer — Main Resolver
 *
 * Composes all 5 resolution layers into a single TrustProfile.
 * This is the main export of @synthesis/resolver.
 *
 * Usage:
 *   import { resolve } from '@synthesis/resolver'
 *   const profile = await resolve('emilemarcelagustin.eth')
 */

import type { TrustProfile, TrustTier } from "./schema.js";
import { resolvePersonhood } from "./layers/personhood.js";
import { resolveIdentity } from "./layers/identity.js";
import { resolveContext } from "./layers/context.js";
import { resolveManifest } from "./layers/manifest.js";
import { resolveSkill } from "./layers/skill.js";
import { createEnsClient, resolveAddress, normalizeName } from "./utils/ens.js";

export interface ResolveOptions {
  /** Known agent IDs to scan for ENSIP-25 records */
  knownAgentIds?: string[];
  /** Custom RPC URL for ENS resolution (mainnet) */
  ensRpcUrl?: string;
  /** Networks to check for AgentBook personhood */
  personhoodNetworks?: ("base" | "world" | "base-sepolia")[];
  /** Maximum lineage depth for AIP prev chain traversal */
  maxLineageDepth?: number;
}

/**
 * Resolve an ENS name through all 5 trust layers.
 *
 * Returns a complete TrustProfile with per-layer results and
 * an aggregate trust score.
 */
export async function resolve(
  ensName: string,
  options: ResolveOptions = {},
): Promise<TrustProfile> {
  const normalized = normalizeName(ensName);
  const client = createEnsClient(options.ensRpcUrl);

  // Resolve the ENS name to an address
  const address = await resolveAddress(client, normalized);

  // Layer 0: Personhood (World ID)
  const personhood = address
    ? await resolvePersonhood(address, {
        networks: options.personhoodNetworks
          ? [...options.personhoodNetworks]
          : undefined,
      })
    : { verified: false, nullifierHash: null, network: null, agentBookAddress: null };

  // Layer 1: Identity (ENSIP-25)
  const identity = await resolveIdentity(normalized, options.knownAgentIds, {
    ensRpcUrl: options.ensRpcUrl,
  });

  // Layer 2: Discovery (ENSIP-26)
  const context = await resolveContext(normalized, {
    ensRpcUrl: options.ensRpcUrl,
  });

  // Layer 3: Integrity (AIP)
  const manifest = await resolveManifest(normalized, {
    ensRpcUrl: options.ensRpcUrl,
    maxLineageDepth: options.maxLineageDepth,
  });

  // Layer 4: Capability (DVS)
  const skill = await resolveSkill(normalized, context.skillUrl, {
    ensRpcUrl: options.ensRpcUrl,
  });

  // Compute trust tier
  const trustScore = computeTrustTier(identity, context, manifest, skill);

  return {
    ensName: normalized,
    address,
    resolvedAt: Date.now(),
    trustScore,
    personhood,
    identity,
    context,
    manifest,
    skill,
  };
}

/**
 * Compute the aggregate trust tier from layer results.
 *
 * Progressive — each tier requires all previous:
 * - none:         no ENSIP-25 registration found
 * - registered:   ENSIP-25 verified, on-chain identity confirmed
 * - discoverable: ENSIP-26 agent-context present
 * - verified:     AIP manifest found, signature valid
 * - full:         all layers verified, SKILL.md on verified domain, lineage intact
 *
 * Personhood is an enrichment signal, not a tier gate.
 */
function computeTrustTier(
  identity: TrustProfile["identity"],
  context: TrustProfile["context"],
  manifest: TrustProfile["manifest"],
  skill: TrustProfile["skill"],
): TrustTier {
  if (!identity.verified) return "none";
  if (!context.found) return "registered";
  if (!manifest.found || !manifest.signatureValid) return "discoverable";
  if (!skill.found || !skill.domainVerified || !manifest.lineageIntact)
    return "verified";
  return "full";
}
