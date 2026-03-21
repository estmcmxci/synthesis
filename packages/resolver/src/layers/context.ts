/**
 * Resolution Layer 2: Discovery (ENSIP-26)
 *
 * Reads the `agent-context` text record from an ENS name.
 * Parses as JSON if structured. Extracts SKILL.md URL if present.
 *
 * Read-only: never writes records.
 */

import type { PublicClient } from "viem";
import type { ContextResult } from "../schema.js";
import { createEnsClient, getTextRecord } from "../utils/ens.js";

const AGENT_CONTEXT_KEY = "agent-context";

/** Known keys where a SKILL.md URL might appear in parsed context */
const SKILL_URL_KEYS = ["skill", "skillUrl", "skill_url", "skills"];

export interface ResolveContextOptions {
  ensRpcUrl?: string;
}

/**
 * Resolve ENSIP-26 agent-context for an ENS name.
 *
 * Reads the `agent-context` text record, attempts JSON parsing,
 * and extracts a SKILL.md URL if present.
 */
export async function resolveContext(
  ensName: string,
  options: ResolveContextOptions = {},
): Promise<ContextResult> {
  const client = createEnsClient(options.ensRpcUrl);
  const raw = await getTextRecord(client, ensName, AGENT_CONTEXT_KEY);

  if (!raw) {
    return { found: false, raw: null, parsed: null, skillUrl: null };
  }

  // Try parsing as JSON
  let parsed: Record<string, unknown> | null = null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
      parsed = obj as Record<string, unknown>;
    }
  } catch {
    // Not JSON — that's fine, could be a plain URL or free text
  }

  // Extract SKILL.md URL
  const skillUrl = extractSkillUrl(raw, parsed);

  return { found: true, raw, parsed, skillUrl };
}

/**
 * Extract a SKILL.md URL from the context.
 *
 * Checks parsed JSON keys first, then falls back to treating
 * the raw value as a URL if it looks like one.
 */
function extractSkillUrl(
  raw: string,
  parsed: Record<string, unknown> | null,
): string | null {
  // Check known keys in parsed JSON
  if (parsed) {
    for (const key of SKILL_URL_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" && looksLikeUrl(value)) {
        return value;
      }
    }
  }

  // If the raw value itself is a URL pointing to a skill.md, use it
  if (looksLikeUrl(raw) && raw.toLowerCase().includes("skill")) {
    return raw;
  }

  return null;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//.test(value) || value.startsWith("ipfs://");
}
