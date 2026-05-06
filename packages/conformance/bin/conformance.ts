#!/usr/bin/env node
import { parseArgs } from "node:util";
import { runRuntimeSuite } from "../src/runtime/suite.ts";
import { runVerifierSuite } from "../src/verifier/suite.ts";
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
} from "../src/verifier/fixtures.ts";
import { buildReport } from "../src/shared/report.ts";
import type { ConformanceReport } from "../src/shared/types.ts";

const PKG_VERSION = "0.1.0";

const USAGE = `usage:
  conformance run <ens-name>     run runtime suite against a live deployment
  conformance run --self-test    run verifier suite against @synthesis/resolver

flags:
  --no-probe-sign                skip the optional 6th (signature) check
  --format json|pretty           output format (default: pretty)`;

function buildAllFixtures(): Fixture[] {
  return [
    buildValidFixture(),
    tamperPolicy(buildValidFixture()),
    stalePolicyHash(buildValidFixture()),
    removeRecord(buildValidFixture(), "delegation"),
    schemaRejectsRecords(buildValidFixture()),
    expireSession(buildValidFixture()),
    mismatchKernelWallet(buildValidFixture()),
    unreachableEndpoint(buildValidFixture()),
    wrongSigner(buildValidFixture()),
  ];
}

function output(report: ConformanceReport, format: string): void {
  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const { target, summary } = report;
  console.log(`Conformance Report — ${target.audience} :: ${target.descriptor}`);
  console.log(
    `  Spec ${report.specVersion}  Package v${report.packageVersion}  ${report.timestamp}`,
  );
  console.log("");
  for (const c of report.cases) {
    const mark = c.outcome === "pass" ? "✓" : c.outcome === "fail" ? "✗" : "—";
    const layer = c.layer ? ` (${c.layer})` : "";
    console.log(`  ${mark} ${c.id}${layer}`);
    if (c.outcome !== "pass" && c.detail) {
      console.log(`      ${c.detail}`);
    }
  }
  console.log("");
  console.log(
    `  Summary: ${summary.passed}/${summary.total} passed  ${summary.failed} failed  ${summary.skipped} skipped`,
  );
  console.log(`  Merkle root: ${report.merkleRoot}`);
}

async function main(): Promise<number> {
  let parsed: { values: Record<string, unknown>; positionals: string[] };
  try {
    parsed = parseArgs({
      options: {
        "self-test": { type: "boolean" },
        "probe-sign": { type: "boolean", default: true },
        "no-probe-sign": { type: "boolean" },
        format: { type: "string", default: "pretty" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    });
  } catch (err) {
    console.error((err as Error).message);
    console.error(USAGE);
    return 1;
  }

  if (parsed.values.help || parsed.positionals.length === 0) {
    console.log(USAGE);
    return parsed.values.help ? 0 : 1;
  }

  if (parsed.positionals[0] !== "run") {
    console.error(`unknown command: ${parsed.positionals[0]}`);
    console.error(USAGE);
    return 1;
  }

  const probeSign = parsed.values["no-probe-sign"] ? false : Boolean(parsed.values["probe-sign"]);
  const format = String(parsed.values.format ?? "pretty");

  if (parsed.values["self-test"]) {
    const fixtures = buildAllFixtures();
    const { cases } = await runVerifierSuite({ fixtures, probeSign });
    const report = buildReport({
      audience: "verifier",
      descriptor: "@synthesis/resolver",
      cases,
      packageVersion: PKG_VERSION,
    });
    output(report, format);
    return report.summary.failed === 0 ? 0 : 1;
  }

  const ensName = parsed.positionals[1];
  if (!ensName) {
    console.error("missing <ens-name>");
    console.error(USAGE);
    return 1;
  }
  const { cases } = await runRuntimeSuite({ ensName, probeSign });
  const report = buildReport({
    audience: "runtime",
    descriptor: ensName,
    cases,
    packageVersion: PKG_VERSION,
  });
  output(report, format);
  return report.summary.failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("conformance: fatal:", err);
    process.exit(2);
  });
