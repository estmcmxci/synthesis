import { verifyAgentIdentity, type AgentVerifyOptions, type AgentVerifyResult } from "@synthesis/resolver";
import { deriveRuntimeCases } from "../shared/assert.ts";
import type { CaseResult } from "../shared/types.ts";

export interface RuntimeSuiteOptions {
  ensName: string;
  probeSign?: boolean;
  verifyOptions?: Omit<AgentVerifyOptions, "probeSign">;
}

export interface RuntimeSuiteResult {
  cases: CaseResult[];
  raw: AgentVerifyResult;
}

/**
 * Run the runtime conformance suite against a live ENS-bound agent.
 *
 * One case per layer (records, schema, integrity, binding, liveness, signature).
 * The signature case is skipped when probeSign is false. The suite is a thin
 * wrapper around @synthesis/resolver's verifyAgentIdentity — it deliberately
 * does not reimplement verification, so the suite and the CLI cannot drift.
 */
export async function runRuntimeSuite(opts: RuntimeSuiteOptions): Promise<RuntimeSuiteResult> {
  const raw = await verifyAgentIdentity(opts.ensName, {
    ...opts.verifyOptions,
    probeSign: opts.probeSign ?? false,
  });
  return { cases: deriveRuntimeCases(raw), raw };
}
