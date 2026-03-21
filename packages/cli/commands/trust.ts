/**
 * Trust Command — Full TRL Resolution
 *
 * The flagship command. Resolves an ENS name through all 5 trust layers
 * and displays the result.
 */

import colors from "yoctocolors";
import { resolve, type TrustProfile } from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface TrustOptions {
  name: string;
  agentIds?: string[];
}

/**
 * Run full TRL resolution on an ENS name and display results.
 */
export async function trust(options: TrustOptions) {
  const { name, agentIds } = options;

  startSpinner(`Resolving trust profile for ${colors.cyan(name)}...`);

  const profile = await resolve(name, {
    knownAgentIds: agentIds,
  });

  stopSpinner();

  printProfile(profile);
}

function printProfile(profile: TrustProfile) {
  console.log();
  console.log(colors.bold(`  Trust Profile: ${colors.cyan(profile.ensName)}`));
  console.log(colors.dim(`  Address: ${profile.address ?? "unresolved"}`));
  console.log();

  // Layer 0: Personhood
  printLayer(
    "Personhood",
    profile.personhood.verified,
    profile.personhood.verified
      ? `World ID, nullifier: ${profile.personhood.nullifierHash?.slice(0, 10)}...`
      : "not registered in AgentBook",
  );

  // Layer 1: Identity
  printLayer(
    "Identity",
    profile.identity.verified,
    profile.identity.verified
      ? `ERC-8004 #${profile.identity.agentId}, ${profile.identity.registryChain}`
      : "no ENSIP-25 registration found",
  );

  // Layer 2: Context
  printLayer(
    "Context",
    profile.context.found,
    profile.context.found
      ? profile.context.skillUrl
        ? `ENSIP-26, SKILL.md at ${profile.context.skillUrl}`
        : "ENSIP-26 present (no SKILL.md URL)"
      : "no agent-context record",
  );

  // Layer 3: Manifest
  printLayer(
    "Manifest",
    profile.manifest.found && profile.manifest.signatureValid,
    profile.manifest.found
      ? profile.manifest.signatureValid
        ? `AIP ${profile.manifest.latestVersion}, signature valid, lineage depth: ${profile.manifest.lineageDepth}`
        : `AIP ${profile.manifest.latestVersion}, signature INVALID`
      : "no AIP records found",
  );

  // Layer 4: Skill
  printLayer(
    "Skill",
    profile.skill.found && profile.skill.domainVerified,
    profile.skill.found
      ? profile.skill.domainVerified
        ? `domain-verified, served from ${profile.skill.url}`
        : `found but domain NOT verified (${profile.skill.url})`
      : "no SKILL.md found",
  );

  // Trust Tier
  console.log();
  const tierColor = getTierColor(profile.trustScore);
  console.log(`  Trust Tier: ${tierColor(profile.trustScore)}`);
  console.log();
}

function printLayer(name: string, passed: boolean, detail: string) {
  const icon = passed ? colors.green("✓") : colors.red("✗");
  const label = passed ? colors.bold(name) : colors.dim(name);
  console.log(`  ${icon} ${label}: ${colors.dim(detail)}`);
}

function getTierColor(tier: string) {
  switch (tier) {
    case "full":
      return colors.green;
    case "verified":
      return colors.cyan;
    case "discoverable":
      return colors.yellow;
    case "registered":
      return colors.magenta;
    default:
      return colors.red;
  }
}
