/**
 * Resolution Layer 3: Integrity (AIP — Agent Identity Profile)
 *
 * Implements the AIP V2 spec (Mode A — subname-per-version):
 * 1. Read agent-latest + agent-version-lineage from root name
 * 2. Resolve agent-manifest from version subname (e.g., v1.<root>)
 * 3. Fetch manifest from IPFS
 * 4. Verify signature against ENS owner
 * 5. Walk prev chain for lineage audit
 *
 * Read-only: never writes records.
 */

import { verifyMessage, type PublicClient } from "viem";
import type { AgentManifest, ManifestResult } from "../schema.js";
import { AgentManifestSchema } from "../schema.js";
import { createEnsClient, getTextRecord, resolveAddress } from "../utils/ens.js";
import { extractCid, fetchFromIpfs } from "../utils/ipfs.js";

export interface ResolveManifestOptions {
  ensRpcUrl?: string;
  maxLineageDepth?: number;
}

/**
 * Resolve AIP manifest for an ENS name.
 *
 * Follows the AIP V2 client behavior (Section 3):
 * 1. Read agent-latest and agent-version-lineage from root
 * 2. Resolve manifestRef based on lineage mode
 * 3. Fetch + parse manifest
 * 4. Verify ensName, version, and signature
 * 5. Walk prev pointers for lineage audit
 */
export async function resolveManifest(
  ensName: string,
  options: ResolveManifestOptions = {},
): Promise<ManifestResult> {
  const client = createEnsClient(options.ensRpcUrl);
  const maxDepth = options.maxLineageDepth ?? 10;

  // Step 1: Read root records
  const [latestVersion, lineageMode] = await Promise.all([
    getTextRecord(client, ensName, "agent-latest"),
    getTextRecord(client, ensName, "agent-version-lineage"),
  ]);

  if (!latestVersion) {
    return emptyResult();
  }

  // Step 2: Resolve manifestRef based on lineage mode
  let manifestRef: string | null = null;

  if (!lineageMode || lineageMode === "subname") {
    // Mode A (RECOMMENDED): subname-per-version
    const versionName = `${latestVersion}.${ensName}`;
    manifestRef = await getTextRecord(client, versionName, "agent-manifest");
  } else if (lineageMode.startsWith("list:")) {
    // Mode B: parse append-only list, find entry for latest version
    manifestRef = parseListEntry(lineageMode, latestVersion);
  }

  if (!manifestRef) {
    return {
      ...emptyResult(),
      latestVersion,
      lineageMode: lineageMode ?? "subname",
    };
  }

  // Step 3: Fetch manifest from IPFS
  const manifest = await fetchManifest(manifestRef);
  if (!manifest) {
    return {
      ...emptyResult(),
      latestVersion,
      lineageMode: lineageMode ?? "subname",
    };
  }

  // Step 4: Verify manifest
  const signatureValid = await verifyManifestSignature(
    client,
    ensName,
    latestVersion,
    manifest,
  );

  // Step 5: Walk lineage
  const { depth, intact } = await walkLineage(manifest, maxDepth);

  return {
    found: true,
    latestVersion,
    lineageMode: lineageMode ?? "subname",
    manifest,
    signatureValid,
    lineageDepth: depth,
    lineageIntact: intact,
  };
}

/**
 * Fetch and parse an AIP manifest from a CID/URL reference.
 */
async function fetchManifest(
  manifestRef: string,
): Promise<AgentManifest | null> {
  const cid = extractCid(manifestRef);
  if (!cid) return null;

  const content = await fetchFromIpfs(cid);
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);
    const result = AgentManifestSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Verify an AIP manifest signature per AIP V2 Section 2.3.
 *
 * Checks:
 * 1. ensName matches the root name being resolved
 * 2. version matches the version identifier
 * 3. Signature is valid against the current ENS owner
 */
async function verifyManifestSignature(
  client: PublicClient,
  ensName: string,
  expectedVersion: string,
  manifest: AgentManifest,
): Promise<boolean> {
  // Verify ensName matches
  if (manifest.ensName !== ensName) return false;

  // Verify version matches
  if (manifest.version !== expectedVersion) return false;

  // Get the current ENS owner address
  const ownerAddress = await resolveAddress(client, ensName);
  if (!ownerAddress) return false;

  // Build canonical bytes (sorted keys, no whitespace)
  const { signature, ...manifestWithoutSig } = manifest;
  const canonicalBytes = JSON.stringify(manifestWithoutSig, Object.keys(manifestWithoutSig).sort());

  try {
    // Verify EIP-191 signature
    const isValid = await verifyMessage({
      address: ownerAddress,
      message: canonicalBytes,
      signature: signature.value as `0x${string}`,
    });
    return isValid;
  } catch {
    return false;
  }
}

/**
 * Walk the prev pointer chain for lineage audit.
 *
 * Returns the depth (number of prev pointers traversed) and
 * whether the chain is intact (no broken links).
 */
async function walkLineage(
  manifest: AgentManifest,
  maxDepth: number,
): Promise<{ depth: number; intact: boolean }> {
  let depth = 0;
  let current = manifest.prev;

  while (current && depth < maxDepth) {
    const cid = extractCid(current);
    if (!cid) return { depth, intact: false };

    const content = await fetchFromIpfs(cid);
    if (!content) return { depth, intact: false };

    try {
      const parsed = JSON.parse(content);
      const result = AgentManifestSchema.safeParse(parsed);
      if (!result.success) return { depth, intact: false };

      depth++;
      current = result.data.prev;
    } catch {
      return { depth, intact: false };
    }
  }

  // If current is null, we've reached genesis — lineage is intact
  return { depth, intact: current === null };
}

/**
 * Parse a Mode B list entry to find the manifestRef for a version.
 */
function parseListEntry(
  listValue: string,
  version: string,
): string | null {
  const lines = listValue
    .replace(/^list:/, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts[0] === version && parts[1]) {
      return parts[1];
    }
  }

  return null;
}

function emptyResult(): ManifestResult {
  return {
    found: false,
    latestVersion: null,
    lineageMode: null,
    manifest: null,
    signatureValid: false,
    lineageDepth: 0,
    lineageIntact: false,
  };
}
