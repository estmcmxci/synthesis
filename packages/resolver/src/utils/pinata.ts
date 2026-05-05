/**
 * Pinata IPFS pinning — directory uploads via `pinFileToIPFS`.
 *
 * Why raw fetch instead of `@pinata/sdk`: one endpoint, one POST, ~80 lines.
 * Pulling a top-level dep for that is a dep tax we'd carry into every
 * downstream package that imports `@synthesis/resolver`. The bash scripts
 * this code ports from also use raw curl; staying close to that surface
 * makes mismatches easier to diagnose.
 *
 * Read-only on ENS — never writes records.
 */

const PIN_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const DEFAULT_GATEWAY = "gateway.pinata.cloud";

/**
 * Pinata's `pinFileToIPFS` only preserves directory structure when every
 * uploaded file shares a common parent prefix. The bash invents a fake
 * `pin-root/` prefix and prepends it to every form-field filename;
 * Pinata strips the shared prefix and roots the resulting CID at the tree
 * below. Replicate exactly — without it, multi-file uploads collapse to
 * a flat list and `ipfs://<cid>/schemas/...` paths stop resolving.
 */
const PIN_ROOT = "pin-root";

export interface PinDirectoryFile {
  /** Path within the pinned directory (e.g. `schemas/agent-schema-v1.json`). */
  relpath: string;
  bytes: Uint8Array;
}

export interface PinDirectoryOptions {
  /** Pinata API JWT. Required. Matches the `PINATA_JWT` env var name. */
  jwt: string;
  /** Pinata `pinataMetadata.name`. Defaults to a stable string the caller picks. */
  metadataName?: string;
  /** Gateway used to construct returned `gatewayUrl`s. Default: gateway.pinata.cloud. */
  gateway?: string;
  /** Inject for tests. Default: globalThis.fetch. */
  fetch?: typeof fetch;
}

export interface PinDirectoryResult {
  cid: string;
  files: { relpath: string; ipfsUri: string; gatewayUrl: string }[];
}

/**
 * Pin a set of files to Pinata as a single directory. Returns the
 * directory CID and per-file `ipfs://` and gateway URLs rooted at it.
 *
 * Throws if Pinata returns a non-2xx response or omits `IpfsHash` from
 * the JSON body. Network errors propagate — callers can wrap or retry.
 */
export async function pinDirectory(
  files: PinDirectoryFile[],
  options: PinDirectoryOptions,
): Promise<PinDirectoryResult> {
  if (files.length === 0) {
    throw new Error("pinDirectory: at least one file is required");
  }
  if (files.length === 1) {
    // Pinata flattens single-file pins regardless of the synthetic root.
    // The bash warns about this; we reject it outright so the caller
    // either adds a sentinel file (e.g. README.md) or uses a different
    // single-file API.
    throw new Error(
      "pinDirectory: at least 2 files are required (Pinata flattens single-file directory pins). Add a sentinel file to preserve the tree.",
    );
  }
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const gateway = options.gateway ?? DEFAULT_GATEWAY;

  const form = new FormData();
  for (const f of files) {
    // FormData accepts a Blob; preserves binary bytes exactly.
    // Cast through BlobPart — TS lib types reject Uint8Array<ArrayBufferLike>
    // for Blob() in some lib targets even though it's the canonical input.
    const blob = new Blob([f.bytes as BlobPart]);
    form.append("file", blob, `${PIN_ROOT}/${f.relpath}`);
  }
  form.append(
    "pinataMetadata",
    JSON.stringify({ name: options.metadataName ?? "synthesis-agent-pin" }),
  );
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const response = await fetchImpl(PIN_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${options.jwt}` },
    body: form,
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      // ignore
    }
    throw new Error(`Pinata pin failed: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }

  const body = (await response.json()) as { IpfsHash?: string };
  const cid = body.IpfsHash;
  if (!cid) {
    throw new Error(`Pinata pin failed: response missing IpfsHash (got: ${JSON.stringify(body).slice(0, 200)})`);
  }

  return {
    cid,
    files: files.map((f) => ({
      relpath: f.relpath,
      ipfsUri: `ipfs://${cid}/${f.relpath}`,
      gatewayUrl: `https://${gateway}/ipfs/${cid}/${f.relpath}`,
    })),
  };
}

export interface VerifyPinOptions {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * Probe each pinned file's gateway URL to confirm Pinata has propagated
 * the directory. Returns the first failure (file + reason) or null on
 * full success. The bash scripts call out a transient-pin-failure mode
 * where the CID is returned but content isn't immediately readable —
 * this surfaces it before the operator publishes a record pointing at
 * dead bytes.
 */
export async function verifyPinResolves(
  result: PinDirectoryResult,
  options: VerifyPinOptions = {},
): Promise<{ relpath: string; reason: string } | null> {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 30_000;
  for (const f of result.files) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(f.gatewayUrl, { signal: controller.signal });
      if (!res.ok) {
        return { relpath: f.relpath, reason: `HTTP ${res.status}` };
      }
    } catch (err) {
      return { relpath: f.relpath, reason: (err as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
