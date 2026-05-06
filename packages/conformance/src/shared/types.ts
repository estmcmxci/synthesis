import type { AgentVerifyResult } from "@synthesis/resolver";

export const LAYER_NAMES = [
  "records",
  "schema",
  "integrity",
  "binding",
  "liveness",
  "signature",
] as const;

export type LayerName = (typeof LAYER_NAMES)[number];

export type CaseOutcome = "pass" | "fail" | "skip";

export interface CaseResult {
  id: string;
  audience: "runtime" | "verifier";
  outcome: CaseOutcome;
  layer: LayerName | null;
  expected: { verified?: boolean; failingLayer?: LayerName };
  observed: { verified: boolean; failingLayers: LayerName[] };
  detail?: string;
  verifyResult?: AgentVerifyResult;
}

export interface ConformanceReport {
  specVersion: string;
  packageVersion: string;
  timestamp: string;
  target: { audience: "runtime" | "verifier"; descriptor: string };
  cases: CaseResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  };
  merkleRoot: string;
}
