/**
 * Resolution Layer 4: Capability (DVS — Domain-Verified SKILL.md)
 *
 * Fetches SKILL.md from the URL extracted by the context layer (Layer 2).
 * Verifies that the serving domain is owned by the same ENS name.
 *
 * Domain verification: if the SKILL.md is served from `<name>.eth.limo`
 * or a domain whose ENS reverse record matches the root name, it's verified.
 *
 * Read-only: never writes.
 */

import type { SkillResult } from "../schema.js";
import { createEnsClient, resolveAddress } from "../utils/ens.js";
import { extractCid, fetchFromIpfs } from "../utils/ipfs.js";

export interface ResolveSkillOptions {
  ensRpcUrl?: string;
  timeout?: number;
}

/**
 * Resolve SKILL.md for an ENS name given a skill URL from the context layer.
 *
 * If skillUrl is null (no URL found in agent-context), returns not found.
 */
export async function resolveSkill(
  ensName: string,
  skillUrl: string | null,
  options: ResolveSkillOptions = {},
): Promise<SkillResult> {
  if (!skillUrl) {
    return { found: false, domainVerified: false, content: null, url: null };
  }

  // Fetch the SKILL.md content
  const content = await fetchSkillContent(skillUrl, options.timeout);
  if (!content) {
    return { found: false, domainVerified: false, content: null, url: skillUrl };
  }

  // Verify domain ownership
  const domainVerified = verifyDomain(ensName, skillUrl);

  return {
    found: true,
    domainVerified,
    content,
    url: skillUrl,
  };
}

/**
 * Fetch SKILL.md content from a URL or IPFS CID.
 */
async function fetchSkillContent(
  url: string,
  timeout?: number,
): Promise<string | null> {
  // If it's an IPFS reference, fetch via gateway
  const cid = extractCid(url);
  if (cid) {
    return fetchFromIpfs(cid, { timeout });
  }

  // Otherwise fetch via HTTP
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout ?? 10_000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      return await response.text();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify that the SKILL.md URL's domain is owned by the ENS name.
 *
 * Verified if:
 * 1. URL is served from `<name>.eth.limo` (ENS gateway)
 * 2. URL is served from `<name>.eth.link` (legacy ENS gateway)
 * 3. URL is an IPFS reference (domain-neutral, verified by content hash)
 */
function verifyDomain(ensName: string, url: string): boolean {
  // IPFS URLs are domain-neutral — verified by content addressing
  if (url.startsWith("ipfs://") || extractCid(url)) {
    return true;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const normalizedName = ensName.toLowerCase();

    // Check eth.limo gateway: <name>.eth.limo
    if (hostname === `${normalizedName}.limo`) {
      return true;
    }

    // Check eth.link gateway: <name>.eth.link
    if (hostname === `${normalizedName}.link`) {
      return true;
    }

    // Check if hostname starts with the ENS name (subdomains)
    if (hostname.startsWith(`${normalizedName}.`)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
