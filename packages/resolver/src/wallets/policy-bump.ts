/**
 * Pure policy-doc version-bump helper.
 *
 * Carries forward all non-rotated fields byte-for-byte. Mutates only:
 *   - `version`
 *   - `active-session-key.address`
 *   - `active-session-key.issued-at`
 *   - `active-session-key.ttl-hours` (when `newTtlHours` is provided)
 *   - top-level `issued-at`
 *
 * No IO. No `Date.now()` at module-eval (the test in policy-bump.test.ts
 * asserts byte-identical JCS output across two calls with the same
 * inputs, which catches accidental impurity).
 */

import type { Address } from "viem";

export interface PolicyDoc {
  $schema?: string;
  $id?: string;
  "schema-uri"?: string;
  agent?: { "ens-name"?: string; [k: string]: unknown };
  version?: string;
  "issued-at"?: string;
  delegators?: unknown[];
  "delegation-policy"?: {
    threshold?: string;
    scope?: string[];
    "ttl-hours"?: number;
    "permitted-message-classes"?: string[];
    prohibited?: string[];
  };
  "active-session-key"?: {
    address?: string;
    "issued-at"?: string;
    "ttl-hours"?: number;
    "kernel-wallet"?: string;
  };
  revocation?: unknown;
  [k: string]: unknown;
}

export interface BumpPolicyArgs {
  newVersion: string; // e.g. "v2"
  newSessionKeyAddress: Address;
  /**
   * RFC 3339 timestamp. REQUIRED — we don't default to `Date.now()`
   * because that would make the function impure (two calls with the
   * same inputs would produce different bytes). Caller mints the
   * timestamp explicitly so it can be controlled in tests + replayed
   * for verification.
   */
  issuedAt: string;
  /** Optional TTL override; carried forward from the current doc when omitted. */
  newTtlHours?: number;
}

const VERSION_RE = /^v[0-9]+(\.[0-9]+){0,2}$/;

export function bumpPolicy(currentDoc: PolicyDoc, args: BumpPolicyArgs): PolicyDoc {
  if (!VERSION_RE.test(args.newVersion)) {
    throw new Error(`bumpPolicy: invalid newVersion "${args.newVersion}" (expected v<N>[.<M>[.<P>]])`);
  }
  if (!currentDoc["active-session-key"]) {
    throw new Error(
      `bumpPolicy: current doc lacks "active-session-key" — input is not a v1+ delegation policy`,
    );
  }

  const ttl =
    args.newTtlHours ??
    currentDoc["active-session-key"]["ttl-hours"] ??
    currentDoc["delegation-policy"]?.["ttl-hours"] ??
    168;

  // Structural clone the carry-forward fields. Use JSON round-trip for
  // a deep clone so nested object identity doesn't leak into the new doc.
  const next = JSON.parse(JSON.stringify(currentDoc)) as PolicyDoc;
  next.version = args.newVersion;
  next["issued-at"] = args.issuedAt;
  next["active-session-key"] = {
    ...next["active-session-key"]!,
    address: args.newSessionKeyAddress,
    "issued-at": args.issuedAt,
    "ttl-hours": ttl,
  };
  // Bump the top-level $id suffix too if it has a /vN.json shape, so the
  // doc remains self-describing. Best-effort — leave as-is if no match.
  if (typeof next.$id === "string") {
    next.$id = next.$id.replace(/-v[0-9]+(\.[0-9]+){0,2}\.json$/, `-${args.newVersion}.json`);
  }
  return next;
}

/**
 * Parse an on-chain `policy-version` text record like "v1" or "v1.2"
 * and return the next major version: "v1" → "v2", "v1.2" → "v2".
 * Major bumps only — minor/patch revisions aren't part of the rotation
 * spec; they'd indicate a non-rotation policy edit which is out of
 * scope (issue #54 §"Out of scope").
 */
export function nextMajorVersion(current: string): string {
  if (!VERSION_RE.test(current)) {
    throw new Error(`nextMajorVersion: invalid current version "${current}"`);
  }
  const major = parseInt(current.slice(1).split(".")[0], 10);
  return `v${major + 1}`;
}
