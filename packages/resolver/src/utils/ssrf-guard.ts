/**
 * SSRF guard for record-controlled URLs.
 *
 * The agent verifier fetches several URLs that are controlled by the ENS
 * name owner (`schema`, `delegation`, `agent-endpoint[web]/health`). When
 * the verifier runs as a CLI for a known agent, the operator has chosen
 * the target. When it runs server-side on a public web route accepting
 * arbitrary ENS names, a malicious owner could publish a URL pointing at
 * an internal service (cloud metadata, loopback, link-local, RFC 1918) and
 * exfiltrate or probe it via the verifier's fetches.
 *
 * Mitigation: before issuing any HTTP(S) fetch, resolve the hostname's
 * IP addresses and reject if any resolved address is in a private,
 * loopback, link-local, or otherwise non-public range. Also reject a
 * small set of literal local hostnames to defend against trick names
 * that bypass our checks via local hosts files.
 *
 * The guard is conservative: a hostname that resolves to even one private
 * address is rejected, since DNS rebinding attacks could rotate which
 * address is used between resolution and fetch. (Production-grade defense
 * would also pin the resolved IP and pass it to the fetch directly; we
 * accept the residual rebind risk here as out of scope for v0.1.)
 */

import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";

export class SsrfBlockedError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: string,
  ) {
    super(`SSRF guard blocked ${url}: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

/**
 * Throw `SsrfBlockedError` if `rawUrl` is non-public.
 *
 * Public means: protocol is http(s), hostname is not a literal local name,
 * and every DNS-resolved IP is in a non-private range.
 *
 * The check is async because it does a DNS lookup. Callers should `await`
 * before invoking fetch.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(rawUrl, "malformed URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SsrfBlockedError(rawUrl, `non-http(s) protocol: ${url.protocol}`);
  }

  // WHATWG URL parses IPv6 literals with brackets retained (`[::1]`).
  // Strip them so range-check helpers see the bare address.
  const rawHost = url.hostname.toLowerCase();
  const host =
    rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;

  if (host === "" || LOCAL_HOSTNAMES.has(host)) {
    throw new SsrfBlockedError(rawUrl, `local hostname: ${host || "<empty>"}`);
  }

  // Hostname may already be a literal IP. Skip DNS in that case.
  if (isIPv4(host) || isIPv6Literal(host)) {
    if (isIPv4(host) ? isPrivateIPv4(host) : isPrivateIPv6(host)) {
      throw new SsrfBlockedError(
        rawUrl,
        `literal IP ${host} is in a private/reserved range`,
      );
    }
    return;
  }

  let resolved: { address: string; family: number }[];
  try {
    resolved = await lookup(host, { all: true, verbatim: true });
  } catch (err) {
    throw new SsrfBlockedError(
      rawUrl,
      `DNS resolution failed: ${(err as Error).message}`,
    );
  }

  if (resolved.length === 0) {
    throw new SsrfBlockedError(rawUrl, "DNS returned no addresses");
  }

  for (const { address, family } of resolved) {
    if (family === 4) {
      if (isPrivateIPv4(address)) {
        throw new SsrfBlockedError(
          rawUrl,
          `IPv4 ${address} is in a private/reserved range`,
        );
      }
    } else if (family === 6) {
      if (isPrivateIPv6(address)) {
        throw new SsrfBlockedError(
          rawUrl,
          `IPv6 ${address} is in a private/reserved range`,
        );
      }
    } else {
      throw new SsrfBlockedError(
        rawUrl,
        `unknown address family for ${address}`,
      );
    }
  }
}

/**
 * Conservative IPv6 literal check — rejects bracketed forms and any
 * string that contains `:` (Node's `net.isIPv6` accepts canonical form
 * but is fine for our use). Centralized here for reuse + testability.
 */
function isIPv6Literal(host: string): boolean {
  // Strip square brackets if the caller passed `[::1]`.
  const candidate = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  // node:net's isIPv6 isn't re-exported here; do a permissive check that
  // catches anything with a colon. False positives cascade into
  // isPrivateIPv6 which only returns true on actual matches, so a
  // not-actually-IPv6 string just falls through harmlessly to "non-private."
  return candidate.includes(":");
}

/**
 * RFC 1918 + RFC 6598 + RFC 5735 + RFC 6890. Returns true if the IPv4
 * literal is in a non-public range.
 *
 * Exported for testing.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    // Malformed; block conservatively.
    return true;
  }
  const [a, b] = parts;

  // 0.0.0.0/8 — "this network"
  if (a === 0) return true;
  // 10.0.0.0/8 — RFC 1918 private
  if (a === 10) return true;
  // 100.64.0.0/10 — RFC 6598 carrier-grade NAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local (incl. AWS/GCP/Azure metadata at 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — RFC 1918 private
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 — IETF protocol assignments
  if (a === 192 && b === 0) return true;
  // 192.168.0.0/16 — RFC 1918 private
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 — benchmark testing
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 — multicast (E for "everyone" reserved through 239)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 — reserved
  if (a >= 240) return true;

  return false;
}

/**
 * IPv6 private/reserved ranges. Returns true for loopback, link-local,
 * unique local, IPv4-mapped private, and unspecified.
 *
 * Exported for testing.
 */
export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::/128 unspecified
  if (lower === "::") return true;
  // ::1 loopback
  if (lower === "::1") return true;

  // ::ffff:x.x.x.x — IPv4-mapped. Unwrap and re-check the IPv4.
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (isIPv4(v4)) return isPrivateIPv4(v4);
  }

  // fe80::/10 — link-local. First 10 bits = 1111 1110 10. Hex prefix
  // ranges over fe80..febf.
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;

  // fc00::/7 — unique local addresses (ULA). Hex prefix fc00..fdff.
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;

  return false;
}
