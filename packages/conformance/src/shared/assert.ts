import type { AgentVerifyResult } from "@synthesis/resolver";
import { type CaseResult, type LayerName } from "./types.ts";

export function failingLayers(result: AgentVerifyResult): LayerName[] {
  const out: LayerName[] = [];
  if (!result.layers.records.passed) out.push("records");
  if (!result.layers.schema.passed) out.push("schema");
  if (!result.layers.integrity.passed) out.push("integrity");
  if (!result.layers.binding.passed) out.push("binding");
  if (!result.layers.liveness.passed) out.push("liveness");
  if (result.layers.signature.passed === false) out.push("signature");
  return out;
}

interface LayerProbe {
  name: LayerName;
  passed: boolean | null;
  detail?: string;
}

function probeForLayer(name: LayerName, result: AgentVerifyResult): LayerProbe {
  switch (name) {
    case "records": {
      const l = result.layers.records;
      const detail = l.passed
        ? undefined
        : `missing=${l.missing.join(",") || "—"} malformed=${l.malformed.map((m) => m.key).join(",") || "—"}`;
      return { name, passed: l.passed, detail };
    }
    case "schema": {
      const l = result.layers.schema;
      const detail = l.passed ? undefined : `errors=${l.errors.length}`;
      return { name, passed: l.passed, detail };
    }
    case "integrity": {
      const l = result.layers.integrity;
      const detail = l.passed ? undefined : `expected=${l.expected ?? "—"} computed=${l.computed ?? "—"}`;
      return { name, passed: l.passed, detail };
    }
    case "binding": {
      const l = result.layers.binding;
      const detail = l.passed ? undefined : l.details.join("; ");
      return { name, passed: l.passed, detail };
    }
    case "liveness": {
      const l = result.layers.liveness;
      const detail = l.passed ? undefined : `status=${l.responseStatus ?? "—"}`;
      return { name, passed: l.passed, detail };
    }
    case "signature": {
      const l = result.layers.signature;
      const detail = l.passed === null ? "skipped (probeSign=false)" : l.passed ? undefined : `recovered=${l.recovered ?? "—"}`;
      return { name, passed: l.passed, detail };
    }
  }
}

/**
 * Translate an AgentVerifyResult into one CaseResult per layer (runtime audience).
 * Each layer becomes an independent case so a single bad layer does not mask the others.
 */
export function deriveRuntimeCases(result: AgentVerifyResult): CaseResult[] {
  const layers: LayerName[] = ["records", "schema", "integrity", "binding", "liveness", "signature"];
  const failing = failingLayers(result);
  return layers.map((name) => {
    const probe = probeForLayer(name, result);
    const outcome = probe.passed === true ? "pass" : probe.passed === false ? "fail" : "skip";
    return {
      id: `runtime.${name}`,
      audience: "runtime" as const,
      outcome,
      layer: name,
      expected: { verified: true },
      observed: { verified: result.verified, failingLayers: failing },
      detail: probe.detail,
      verifyResult: result,
    };
  });
}

const LAYER_ORDER: LayerName[] = [
  "records",
  "schema",
  "integrity",
  "binding",
  "liveness",
  "signature",
];

/**
 * Assertion helper for verifier-audience cases. Given an expected failing
 * layer (or null for the valid fixture), derive a CaseResult that passes iff:
 *
 * - For the valid case: verified=true AND no layers failing.
 * - For a negative case: verified=false AND the expected layer is the FIRST
 *   failing layer in execution order. Cascading downstream failures are
 *   accepted (records short-circuits all later layers; unreachable endpoint
 *   breaks both /health and /sign), but earlier-than-expected failures fail
 *   the test — those signal the mutator is breaking something other than what
 *   it was designed to break.
 */
export function assertVerifierCase(args: {
  id: string;
  expectFailingLayer: LayerName | null;
  result: AgentVerifyResult;
}): CaseResult {
  const observedFailing = failingLayers(args.result);
  const observedVerified = args.result.verified;

  let outcome: "pass" | "fail";
  let detail: string | undefined;

  if (args.expectFailingLayer === null) {
    outcome = observedVerified && observedFailing.length === 0 ? "pass" : "fail";
    if (outcome === "fail") {
      detail = `expected verified=true, got verified=${observedVerified} failing=[${observedFailing.join(",")}]`;
    }
  } else {
    const firstFailing = LAYER_ORDER.find((l) => observedFailing.includes(l));
    const correctlyRejected = !observedVerified && firstFailing === args.expectFailingLayer;
    outcome = correctlyRejected ? "pass" : "fail";
    if (outcome === "fail") {
      detail = `expected first failing layer = ${args.expectFailingLayer}, got firstFailing=${firstFailing ?? "(none)"} failing=[${observedFailing.join(",")}] verified=${observedVerified}`;
    }
  }

  return {
    id: args.id,
    audience: "verifier",
    outcome,
    layer: args.expectFailingLayer,
    expected: {
      verified: args.expectFailingLayer === null,
      ...(args.expectFailingLayer ? { failingLayer: args.expectFailingLayer } : {}),
    },
    observed: { verified: observedVerified, failingLayers: observedFailing },
    detail,
    verifyResult: args.result,
  };
}
