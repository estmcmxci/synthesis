/**
 * IPFS Utilities — gateway fetch for content-addressed data.
 *
 * Read-only: the resolver never writes to IPFS.
 * Pinning is handled by CLI commands (OmniPin for sites, Pinata for individual files).
 */

const PUBLIC_GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://w3s.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://ipfs.io/ipfs/",
];

/**
 * Extract a CID from various IPFS URI formats.
 *
 * Handles: `ipfs://Qm...`, `ipfs://baf...`, `Qm...`, `baf...`,
 * and gateway URLs like `https://gateway.pinata.cloud/ipfs/Qm...`
 */
export function extractCid(uri: string): string | null {
  // ipfs:// protocol
  const ipfsMatch = uri.match(/^ipfs:\/\/(.+)$/);
  if (ipfsMatch) return ipfsMatch[1];

  // Gateway URL
  const gatewayMatch = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  if (gatewayMatch) return gatewayMatch[1];

  // Bare CID (Qm... or bafy...)
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58})$/.test(uri)) return uri;

  return null;
}

/**
 * Fetch content from IPFS by CID, trying multiple public gateways.
 *
 * Returns the response body as a string, or null if all gateways fail.
 */
export async function fetchFromIpfs(
  cid: string,
  options?: { timeout?: number },
): Promise<string | null> {
  const timeout = options?.timeout ?? 10_000;

  for (const gateway of PUBLIC_GATEWAYS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${gateway}${cid}`, {
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        return await response.text();
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Fetch and parse JSON from IPFS by CID.
 *
 * Returns the parsed object, or null if fetch fails or content isn't valid JSON.
 */
export async function fetchJsonFromIpfs<T = unknown>(
  cid: string,
  options?: { timeout?: number },
): Promise<T | null> {
  const content = await fetchFromIpfs(cid, options);
  if (!content) return null;

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Convert a CID to an ipfs:// URI.
 */
export function cidToUri(cid: string): string {
  return `ipfs://${cid}`;
}

/**
 * Convert a CID to a gateway URL.
 */
export function cidToGatewayUrl(cid: string, gateway?: string): string {
  return `${gateway ?? PUBLIC_GATEWAYS[0]}${cid}`;
}
