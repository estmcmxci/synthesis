/**
 * IPFS Utilities — gateway fetch for content-addressed data.
 *
 * Read-only: the resolver never writes to IPFS.
 * Pinning is handled by CLI commands (OmniPin for sites, Pinata for individual files).
 */

const PUBLIC_GATEWAYS = [
  "https://w3s.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
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

export interface FetchIpfsRawOptions {
  /**
   * Gateway base URLs (each must end with `/ipfs/` or include the trailing
   * slash). First successful 200 wins. If omitted, defaults to PUBLIC_GATEWAYS.
   */
  gateways?: string[];
  /** Per-request timeout in ms. Default: 10_000. */
  timeoutMs?: number;
}

export interface FetchIpfsRawResult {
  /** Winning gateway base URL. */
  gateway: string;
  /** Raw response body bytes — preserved exactly as served, for hashing. */
  bytes: Uint8Array;
}

/**
 * Race an IPFS URI across multiple gateways. First 200 wins; non-2xx and
 * network errors are dropped. The whole race rejects only if every gateway
 * fails or the overall timeout fires.
 *
 * Use this — not `fetchFromIpfs` — when the caller will hash the response
 * bytes (e.g. policy-hash verification): we need to surface raw bytes, not
 * a string that has been through `Response.text()` re-encoding.
 */
export async function fetchIpfsRaw(
  uri: string,
  options: FetchIpfsRawOptions = {},
): Promise<FetchIpfsRawResult> {
  // Parse `ipfs://<cid>[<path>]` directly. Note: extractCid() returns the
  // entire CID-plus-path for multi-segment URIs, so don't reuse it here —
  // we need cid and path as separate strings to avoid duplicating the path
  // when we build the gateway URL.
  const m = uri.match(/^ipfs:\/\/([^/]+)(\/.*)?$/);
  if (!m) {
    throw new Error(`Not an IPFS URI: ${uri}`);
  }
  const cid = m[1];
  const path = m[2] ?? "";
  const gateways = options.gateways?.length ? options.gateways : PUBLIC_GATEWAYS;
  const timeoutMs = options.timeoutMs ?? 10_000;

  const errors: string[] = [];
  const attempts = gateways.map(async (gateway) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${gateway}${cid}${path}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`${gateway} → HTTP ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return { gateway, bytes: new Uint8Array(buffer) };
    } finally {
      clearTimeout(timer);
    }
  });

  // Promise.any — first fulfillment wins. Aggregates all rejections if none.
  try {
    return await Promise.any(attempts);
  } catch (err) {
    const aggregate = err as AggregateError;
    for (const e of aggregate.errors ?? []) {
      errors.push((e as Error).message ?? String(e));
    }
    throw new Error(
      `All IPFS gateways failed for ${uri}: ${errors.join("; ")}`,
    );
  }
}
