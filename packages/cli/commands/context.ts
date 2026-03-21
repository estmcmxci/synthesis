/**
 * Context Commands — ENSIP-26 agent-context
 *
 * Read and write the agent-context text record on an ENS name.
 */

import colors from "yoctocolors";
import { resolveContext } from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";
import { setTextRecordOnChain, getResolver, normalizeEnsName } from "../utils";

export interface ContextGetOptions {
  name: string;
}

export interface ContextSetOptions {
  name: string;
  value: string;
  network?: string;
  useLedger?: boolean;
  accountIndex?: number;
}

/**
 * Read and display the agent-context record for an ENS name.
 */
export async function contextGet(options: ContextGetOptions) {
  const { name } = options;

  startSpinner(`Reading agent-context for ${colors.cyan(name)}...`);
  const result = await resolveContext(name);
  stopSpinner();

  if (!result.found) {
    console.log(colors.red("✗") + " No agent-context record found");
    console.log(colors.dim("  Set one with: ensemble context set <name> <json>"));
    return;
  }

  console.log(colors.green("✓") + " agent-context found");

  if (result.parsed) {
    console.log(`  ${colors.blue("Parsed:")}`);
    for (const [key, value] of Object.entries(result.parsed)) {
      console.log(`    ${colors.dim(`${key}:`)} ${JSON.stringify(value)}`);
    }
  } else {
    console.log(`  ${colors.blue("Raw:")} ${result.raw}`);
  }

  if (result.skillUrl) {
    console.log(`  ${colors.blue("SKILL.md URL:")} ${colors.cyan(result.skillUrl)}`);
  }
}

/**
 * Set the agent-context text record on an ENS name.
 */
export async function contextSet(options: ContextSetOptions) {
  const { name, value, network, useLedger, accountIndex } = options;

  // Validate JSON if it looks like JSON
  if (value.startsWith("{")) {
    try {
      JSON.parse(value);
    } catch {
      console.error(colors.red("Error: value looks like JSON but failed to parse"));
      return;
    }
  }

  const normalized = normalizeEnsName(name);
  const resolverAddress = await getResolver(normalized, network);

  if (!resolverAddress) {
    console.error(colors.red(`No resolver found for ${name}`));
    return;
  }

  startSpinner(`Setting agent-context on ${colors.cyan(name)}...`);

  try {
    await setTextRecordOnChain(
      normalized,
      "agent-context",
      value,
      resolverAddress,
      network,
      useLedger,
      accountIndex ?? 0,
    );
    stopSpinner();

    console.log(colors.green("✓") + ` agent-context set on ${colors.cyan(name)}`);
    console.log(`  ${colors.blue("Value:")} ${value.length > 80 ? value.slice(0, 80) + "..." : value}`);
  } catch (error) {
    stopSpinner();
    console.error(colors.red(`Error: ${(error as Error).message}`));
  }
}
