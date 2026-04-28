/**
 * Gate Command — Trust-Gated Decision
 *
 * Public CLI surface for the gate() primitive in @synthesis/resolver.
 * Resolves an ENS name through all 5 trust layers, applies a TrustPolicy,
 * and prints the resulting decision.
 *
 * Exit code: 0 on allow, 1 on deny — matches the verify.ts convention so
 * shell pipelines can branch on `ensemble gate <name> --min-tier verified`.
 */

import colors from "yoctocolors";
import {
  resolve,
  gate as applyGate,
  type GateDecision,
  type TrustPolicy,
} from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface GateOptions {
  name: string;
  minTier?: TrustPolicy["minTier"];
  requireLineage?: boolean;
  requireSig?: boolean;
  allowSelf?: boolean;
  callerEns?: string;
}

/**
 * Resolve an ENS name, apply a TrustPolicy, print the gate decision.
 *
 * Sets `process.exitCode = 1` on deny so the process exits non-zero
 * after stdout flushes; allow leaves the default exit code (0).
 *
 * Pretty-prints the decision to stdout. Returns the full GateDecision
 * for callers that need it (incur's `--format json` consumes the run
 * callback's return value for machine-readable output).
 */
export async function gate(options: GateOptions): Promise<GateDecision> {
  const policy: TrustPolicy = {
    minTier: options.minTier ?? "verified",
    requireLineage: options.requireLineage ?? true,
    requireSig: options.requireSig ?? true,
    allowSelf: options.allowSelf ?? true,
  };

  startSpinner(`Resolving ${colors.cyan(options.name)}...`);
  const profile = await resolve(options.name);
  stopSpinner();

  const decision = applyGate(profile, policy, options.callerEns);
  printDecision(decision);

  if (!decision.allow) {
    process.exitCode = 1;
  }
  return decision;
}

function printDecision(decision: GateDecision): void {
  const { profile, policy, allow, reason } = decision;

  console.log();
  console.log(
    colors.bold(`  Gate Decision: ${colors.cyan(profile.ensName)}`),
  );
  console.log(colors.dim(`  Address: ${profile.address ?? "unresolved"}`));
  console.log();

  // Per-layer badge breakdown — mirrors `ensemble trust` for visual consistency.
  printLayer("Personhood", profile.personhood.verified);
  printLayer("Identity", profile.identity.verified);
  printLayer("Context", profile.context.found);
  printLayer(
    "Manifest",
    profile.manifest.found &&
      profile.manifest.signatureValid &&
      profile.manifest.lineageIntact,
  );
  printLayer(
    "Skill",
    profile.skill.found && profile.skill.domainVerified,
  );

  console.log();
  const tierColor = getTierColor(profile.trustScore);
  console.log(
    `  Trust Tier: ${tierColor(profile.trustScore)} ${colors.dim(`(required: ${policy.minTier})`)}`,
  );
  console.log();

  if (allow) {
    console.log(`  ${colors.green("✓ ALLOW")}: ${colors.dim(reason)}`);
  } else {
    console.log(`  ${colors.red("✗ DENY")}: ${colors.dim(reason)}`);
  }
  console.log();
}

function printLayer(name: string, passed: boolean): void {
  const icon = passed ? colors.green("✓") : colors.red("✗");
  console.log(`  ${icon} ${name}`);
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
