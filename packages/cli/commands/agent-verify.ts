/**
 * `ensemble agent verify <ens-name>` — CLI presenter.
 *
 * Pure presentation: parse flags, call verifyAgentIdentity, format. The
 * structured AgentVerifyResult is emitted directly when --format json is
 * passed (the synthesis explorer route consumes that shape verbatim).
 */

import colors from "yoctocolors";
import {
  verifyAgentIdentity,
  type AgentVerifyResult,
  type AgentVerifyOptions,
} from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface AgentVerifyCliOptions {
  name: string;
  probeSign?: boolean;
  ipfsGateway?: string[];
  rpc?: string;
  timeout?: string;
  format?: string;
  explain?: boolean;
}

/**
 * Run agent identity verification and print results.
 *
 * Returns the structured result so callers (incur returns it as the command
 * value) can introspect, but printing happens here. Exit-code policy is
 * handled by the top-level `process.exitCode` assignment in this function:
 *   0 — verified
 *   1 — any layer failed
 *   2 — invalid input (caller-side; not used here, reserved for incur input
 *       validation, which already exits 2 on Zod parse errors)
 */
export async function agentVerify(options: AgentVerifyCliOptions): Promise<AgentVerifyResult> {
  // The incur framework owns the global `--format json` flag — when present
  // it auto-renders the run() return value as JSON on stdout. Our command's
  // own `format` option may not be populated when the global flag fires, so
  // also peek at argv to keep the human-readable output suppressed in either
  // case. Otherwise users see both the colored human display AND the JSON.
  const argvSaysJson = process.argv.some(
    (arg, i, arr) =>
      arg === "--format=json" ||
      (arg === "--format" && arr[i + 1] === "json") ||
      (arg === "-f" && arr[i + 1] === "json"),
  );
  const isJson = options.format === "json" || argvSaysJson;
  // Defense-in-depth: the incur schema regexes timeout to digits, but be
  // explicit so a future schema change can't silently produce NaN here.
  let timeoutMs: number | undefined;
  if (options.timeout !== undefined) {
    const parsed = Number(options.timeout);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      const message = `Invalid --timeout: "${options.timeout}" (expected a positive integer in ms)`;
      if (isJson) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(colors.red(message));
      }
      process.exitCode = 2;
      throw new Error(message);
    }
    timeoutMs = parsed;
  }
  const verifyOptions: AgentVerifyOptions = {
    ensRpcUrl: options.rpc,
    ipfsGateways: options.ipfsGateway,
    timeoutMs,
    probeSign: options.probeSign,
  };

  if (!isJson) {
    startSpinner(`Verifying agent identity for ${colors.cyan(options.name)}...`);
  }

  let result: AgentVerifyResult;
  try {
    result = await verifyAgentIdentity(options.name, verifyOptions);
  } catch (err) {
    stopSpinner();
    const message = (err as Error).message;
    if (isJson) {
      const failureShape: AgentVerifyResult = {
        ensName: options.name,
        verified: false,
        identityCard: {
          ensName: options.name,
          agentId: null,
          registryChain: null,
          registryAddress: null,
          ownerAddress: null,
          kernelWallet: null,
          runtimePubkey: null,
          endpointWeb: null,
        },
        layers: {
          records: { passed: false, missing: [], malformed: [] },
          schema: { passed: false, schemaUri: null, errors: [] },
          integrity: { passed: false, expected: null, computed: null, policyGateway: null },
          binding: { passed: false, details: [] },
          liveness: { passed: false, responseStatus: null },
          signature: { passed: null, skipped: true },
        },
        policy: {
          uri: null,
          version: null,
          scope: null,
          permittedClasses: null,
          prohibited: null,
        },
        warnings: [],
        errors: [message],
      };
      console.log(JSON.stringify(failureShape, null, 2));
    } else {
      console.error(colors.red(`Error verifying ${options.name}: ${message}`));
    }
    process.exitCode = 1;
    throw err;
  }

  stopSpinner();

  console.log(formatResult(result, isJson ? "json" : "human", options.explain ?? false));

  process.exitCode = exitCodeFor(result);
  return result;
}

/** 0 on full pass, 1 on any layer failure. (Exit code 2 is reserved for input
 * errors and is set by the incur framework on Zod parse failures.) */
export function exitCodeFor(result: AgentVerifyResult): 0 | 1 {
  return result.verified ? 0 : 1;
}

/** Render the verify result as a string. Pure — no side effects. Used by
 * the CLI command and by `agent-verify.test.ts` to assert output shape. */
export function formatResult(
  result: AgentVerifyResult,
  format: "json" | "human",
  explain: boolean,
): string {
  if (format === "json") return JSON.stringify(result, null, 2);
  return renderHuman(result, explain);
}

function renderHuman(result: AgentVerifyResult, explain: boolean): string {
  const lines: string[] = [];
  const card = result.identityCard;
  lines.push("");
  lines.push(colors.bold("  Identity Card"));
  lines.push(colors.dim("  ─────────────"));
  lines.push(`    ENS name        : ${colors.cyan(result.ensName)}`);
  lines.push(`    Owner           : ${colors.dim(card.ownerAddress ?? "unresolved")}`);
  lines.push(`    Kernel wallet   : ${colors.dim(card.kernelWallet ?? "unresolved")}`);
  lines.push(`    Runtime pubkey  : ${colors.dim(card.runtimePubkey ?? "unresolved")}`);
  lines.push(`    Endpoint        : ${colors.dim(card.endpointWeb ?? "unresolved")}`);
  lines.push("");
  lines.push(colors.bold("  Layered Verification"));
  lines.push(colors.dim("  ────────────────────"));

  const r = result.layers;
  lines.push(layerLine(
    "Records",
    r.records.passed,
    r.records.passed
      ? "9/9 ENSIP-64 keys present and well-typed"
      : [
          r.records.missing.length > 0 && `missing: ${r.records.missing.join(", ")}`,
          r.records.malformed.length > 0 && `malformed: ${r.records.malformed.map((m) => m.key).join(", ")}`,
        ].filter(Boolean).join("; "),
  ));
  if (explain && r.records.malformed.length > 0) {
    for (const m of r.records.malformed) {
      lines.push(colors.dim(`                   ${m.key}: ${m.reason}`));
    }
  }

  lines.push(layerLine(
    "Schema",
    r.schema.passed,
    r.schema.passed
      ? `validated against ${r.schema.schemaUri}`
      : `${r.schema.errors.length} validation error(s)`,
  ));
  if (explain && r.schema.errors.length > 0) {
    for (const e of r.schema.errors.slice(0, 5)) {
      lines.push(colors.dim(`                   ${e.path || "<root>"}: ${e.message}`));
    }
  }

  lines.push(layerLine(
    "Integrity",
    r.integrity.passed,
    r.integrity.passed
      ? `keccak256(JCS(policy)) == ${r.integrity.expected?.slice(0, 10)}...`
      : `expected ${r.integrity.expected?.slice(0, 10) ?? "?"}…, got ${r.integrity.computed?.slice(0, 10) ?? "?"}…`,
  ));
  if (explain && r.integrity.policyGateway) {
    lines.push(colors.dim(`                   gateway: ${r.integrity.policyGateway}`));
  }

  lines.push(layerLine(
    "Binding",
    r.binding.passed,
    r.binding.details[0] ?? (r.binding.passed ? "all bindings consistent" : "see --explain"),
  ));
  if (explain) {
    for (const d of r.binding.details.slice(1)) {
      lines.push(colors.dim(`                   ${d}`));
    }
  }

  lines.push(layerLine(
    "Liveness",
    r.liveness.passed,
    r.liveness.responseStatus
      ? `GET /health → HTTP ${r.liveness.responseStatus}`
      : "endpoint unreachable",
  ));

  if (r.signature.skipped) {
    lines.push(`  ${colors.dim("-")} ${colors.dim("Signature")}    : skipped (use --probe-sign to challenge the daemon)`);
  } else {
    lines.push(layerLine(
      "Signature",
      r.signature.passed === true,
      r.signature.passed
        ? `recovered ${r.signature.recovered?.slice(0, 10)}… == runtime-pubkey`
        : `recovered ${r.signature.recovered ?? "?"} != runtime-pubkey`,
    ));
    if (explain && r.signature.challenge) {
      lines.push(colors.dim(`                   nonce: ${r.signature.challenge.nonce}`));
      lines.push(colors.dim(`                   issuedAt: ${r.signature.challenge.issuedAt}`));
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    for (const w of result.warnings) lines.push(colors.yellow(`  ⚠ ${w}`));
  }
  if (result.errors.length > 0) {
    lines.push("");
    for (const e of result.errors) lines.push(colors.red(`  ✗ ${e}`));
  }

  lines.push("");
  lines.push(result.verified
    ? `  Result: ${colors.green("VERIFIED ✓")}`
    : `  Result: ${colors.red("FAILED ✗")}`);
  lines.push("");
  return lines.join("\n");
}

function layerLine(name: string, passed: boolean, detail: string): string {
  const icon = passed ? colors.green("✓") : colors.red("✗");
  const label = passed ? colors.bold(name) : colors.dim(name);
  const padded = (label + " ".repeat(Math.max(0, 14 - name.length))).slice(0, 50);
  return `  ${icon} ${padded}: ${colors.dim(detail)}`;
}
