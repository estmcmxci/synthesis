import { test } from "node:test";
import assert from "node:assert/strict";
import { runVerifierSuite } from "./suite.ts";
import {
  buildValidFixture,
  expireSession,
  mismatchKernelWallet,
  removeRecord,
  schemaRejectsRecords,
  stalePolicyHash,
  tamperPolicy,
  unreachableEndpoint,
  wrongSigner,
  type Fixture,
} from "./fixtures.ts";
import type { LayerName } from "../shared/types.ts";

test("verifier suite — valid fixture passes all 6 layers", async () => {
  const valid = buildValidFixture();
  const { cases } = await runVerifierSuite({
    fixtures: [valid],
    probeSign: true,
  });
  assert.equal(cases.length, 1);
  const c = cases[0]!;
  assert.equal(
    c.outcome,
    "pass",
    `valid fixture failed: ${c.detail ?? "no detail"} | observed=${JSON.stringify(c.observed)}`,
  );
});

interface NegativeCase {
  name: string;
  apply: (base: Fixture) => Fixture;
  layer: LayerName;
}

const NEGATIVE_CASES: NegativeCase[] = [
  { name: "tamperPolicy",         apply: tamperPolicy,                            layer: "integrity" },
  { name: "stalePolicyHash",      apply: stalePolicyHash,                         layer: "integrity" },
  { name: "removeRecord(delegation)", apply: (f) => removeRecord(f, "delegation"), layer: "records" },
  { name: "schemaRejectsRecords", apply: schemaRejectsRecords,                    layer: "schema" },
  { name: "expireSession",        apply: expireSession,                           layer: "binding" },
  { name: "mismatchKernelWallet", apply: mismatchKernelWallet,                    layer: "binding" },
  { name: "unreachableEndpoint",  apply: unreachableEndpoint,                     layer: "liveness" },
  { name: "wrongSigner",          apply: wrongSigner,                             layer: "signature" },
];

for (const neg of NEGATIVE_CASES) {
  test(`verifier suite — ${neg.name} → ${neg.layer} fails`, async () => {
    const fixture = neg.apply(buildValidFixture());
    fixture.expectFailingLayer = neg.layer; // confirm test wiring matches mutator intent
    const { cases } = await runVerifierSuite({
      fixtures: [fixture],
      probeSign: true,
    });
    assert.equal(cases.length, 1);
    const c = cases[0]!;
    assert.equal(
      c.outcome,
      "pass",
      `expected exactly ${neg.layer} to fail. detail=${c.detail ?? "—"} observed=${JSON.stringify(c.observed)}`,
    );
  });
}
