import { keccak256, toHex } from "viem";
import { canonicalizeBytes } from "@synthesis/resolver";
import type { CaseResult, ConformanceReport } from "./types.ts";

/**
 * Spec version this conformance package pins to. Bumps when the ENSIP-64
 * record convention or the locked --format json shape changes in a way that
 * invalidates prior reports.
 */
export const CONFORMANCE_SPEC_VERSION = "v1";

/**
 * Per-case leaf hash. Strips fields that vary across runs (verifyResult holds
 * a fresh nonce/timestamp on every run) so the leaf is reproducible.
 */
function leafHash(c: CaseResult): `0x${string}` {
  const slim = {
    id: c.id,
    audience: c.audience,
    outcome: c.outcome,
    layer: c.layer,
    expected: c.expected,
    observed: { verified: c.observed.verified, failingLayers: c.observed.failingLayers },
  };
  return keccak256(toHex(canonicalizeBytes(slim as never)));
}

/**
 * Standard pairwise Merkle root over keccak256 leaves. Odd layers duplicate
 * the last leaf. Empty input returns the zero hash.
 */
export function merkleRoot(leaves: `0x${string}`[]): `0x${string}` {
  if (leaves.length === 0) return ("0x" + "0".repeat(64)) as `0x${string}`;
  let layer = leaves;
  while (layer.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i]!;
      const b = layer[i + 1] ?? a;
      next.push(keccak256((a + b.slice(2)) as `0x${string}`));
    }
    layer = next;
  }
  return layer[0]!;
}

export interface BuildReportArgs {
  audience: "runtime" | "verifier";
  descriptor: string;
  cases: CaseResult[];
  packageVersion: string;
  specVersion?: string;
}

export function buildReport(args: BuildReportArgs): ConformanceReport {
  const total = args.cases.length;
  const passed = args.cases.filter((c) => c.outcome === "pass").length;
  const failed = args.cases.filter((c) => c.outcome === "fail").length;
  const skipped = args.cases.filter((c) => c.outcome === "skip").length;
  return {
    specVersion: args.specVersion ?? CONFORMANCE_SPEC_VERSION,
    packageVersion: args.packageVersion,
    timestamp: new Date().toISOString(),
    target: { audience: args.audience, descriptor: args.descriptor },
    cases: args.cases,
    summary: {
      total,
      passed,
      failed,
      skipped,
      passRate: total === 0 ? 0 : passed / total,
    },
    merkleRoot: merkleRoot(args.cases.map(leafHash)),
  };
}
