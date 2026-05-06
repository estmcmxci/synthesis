import {
  verifyAgentIdentity,
  type AgentVerifyOptions,
  type AgentVerifyResult,
} from "@synthesis/resolver";
import { assertVerifierCase } from "../shared/assert.ts";
import type { CaseResult } from "../shared/types.ts";
import {
  type Fixture,
  buildHealthResponse,
  buildSignResponse,
  ipfsBytesFor,
} from "./fixtures.ts";

export interface VerifierSuiteOptions {
  fixtures: Fixture[];
  probeSign?: boolean;
  /** Override the verifier under test. Default: @synthesis/resolver. */
  verify?: (
    ensName: string,
    options: AgentVerifyOptions,
  ) => Promise<AgentVerifyResult>;
}

export interface VerifierSuiteResult {
  cases: CaseResult[];
}

function fixtureToTestHooks(fixture: Fixture): NonNullable<AgentVerifyOptions["testHooks"]> {
  return {
    readRecords: async (_ensName, keys) => {
      const out: Record<string, string> = {};
      for (const key of keys) {
        const v = fixture.records[key];
        if (v !== undefined) out[key] = v;
      }
      return out;
    },
    fetchIpfs: async (uri) => {
      const bytes = ipfsBytesFor(fixture, uri);
      if (!bytes) throw new Error(`fixture has no IPFS doc for ${uri}`);
      return { bytes, gateway: "fixture://local" };
    },
    getOwner: async () => fixture.ownerAddress,
    fetchEndpoint: async (url, init) => {
      if (!fixture.endpointReachable) {
        throw new Error("ECONNREFUSED");
      }
      if (url.endsWith("/health")) return buildHealthResponse(fixture);
      if (url.endsWith("/sign")) {
        const body = typeof init?.body === "string" ? init.body : "";
        return buildSignResponse(fixture, body);
      }
      return new Response("not found", { status: 404 });
    },
  };
}

/**
 * Run the verifier conformance suite. For each fixture, drive the verifier
 * with testHooks built from the fixture and assert the observed outcome
 * matches the fixture's `expectFailingLayer`.
 */
export async function runVerifierSuite(
  opts: VerifierSuiteOptions,
): Promise<VerifierSuiteResult> {
  const verify = opts.verify ?? verifyAgentIdentity;
  const cases: CaseResult[] = [];
  for (const fixture of opts.fixtures) {
    const result = await verify(fixture.ensName, {
      probeSign: opts.probeSign ?? false,
      testHooks: fixtureToTestHooks(fixture),
    });
    cases.push(
      assertVerifierCase({
        id: `verifier.${fixture.id}`,
        expectFailingLayer: fixture.expectFailingLayer,
        result,
      }),
    );
  }
  return { cases };
}
