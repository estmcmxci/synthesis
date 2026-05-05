/**
 * `ensemble agent pin <dir>` — CLI presenter.
 *
 * Pins a directory of agent-identity files to Pinata via raw fetch
 * (no @pinata/sdk dep). Optionally computes the policy-hash via the
 * resolver's RFC 8785 JCS canonicalizer + viem keccak256 — same path
 * the verifier (#46) uses to validate the on-chain `policy-hash` record,
 * so pin/verify is a closed round-trip.
 *
 * No ENS writes. No mutation of operator config files. Output is
 * structured (--format json) so callers can pipe into `jq` and decide
 * where to put SCHEMA_URI / DELEGATION_URI / POLICY_HASH themselves.
 */

import { readFileSync, readSync, statSync, readdirSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import colors from "yoctocolors";
import { keccak256, toHex } from "viem";
import {
  pinDirectory,
  verifyPinResolves,
  canonicalizeBytes,
  type PinDirectoryFile,
  type PinDirectoryResult,
} from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface AgentPinCliOptions {
  dir: string;
  policy?: string;
  metadataName?: string;
  gateway?: string;
  noVerify?: boolean;
  format?: string;
  explain?: boolean;
}

export interface PinResult extends PinDirectoryResult {
  policyHash?: string;
  policyRelpath?: string;
  verified: boolean;
}

/**
 * Walk `dir` and return all regular files as { relpath, bytes }. Skips
 * macOS metadata files (.DS_Store) — same exclusion the bash uses.
 *
 * Relpaths are always returned with POSIX `/` separators. `path.relative`
 * returns native separators (backslashes on Windows), but Pinata filenames,
 * `ipfs://<cid>/...` URLs, and `--policy <relpath>` matching all need
 * forward slashes to be consistent across platforms.
 */
function readDirRecursive(dir: string): PinDirectoryFile[] {
  const out: PinDirectoryFile[] = [];
  const walk = (sub: string) => {
    for (const entry of readdirSync(sub, { withFileTypes: true })) {
      const full = join(sub, entry.name);
      if (entry.name === ".DS_Store") continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const relpath = relative(dir, full).split(sep).join("/");
        out.push({ relpath, bytes: new Uint8Array(readFileSync(full)) });
      }
    }
  };
  walk(dir);
  return out;
}

function readStdinSync(): Uint8Array {
  // Synchronous stdin read — required so the CLI can be used in pipelines
  // (`cat policy.json | ensemble agent pin <dir> --policy -`) without
  // restructuring the whole command around async stdin handling.
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(65536);
  let bytesRead = 0;
  // fd 0 = stdin
  try {
    while ((bytesRead = readSync(0, buf, 0, buf.length, null)) > 0) {
      chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
    }
  } catch (err) {
    // EAGAIN can happen if stdin is a non-blocking TTY; treat as empty.
    if ((err as NodeJS.ErrnoException).code !== "EAGAIN") throw err;
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function isJsonFlag(): boolean {
  return process.argv.some(
    (arg, i, arr) =>
      arg === "--format=json" ||
      (arg === "--format" && arr[i + 1] === "json") ||
      (arg === "-f" && arr[i + 1] === "json"),
  );
}

export async function agentPin(options: AgentPinCliOptions): Promise<PinResult> {
  const isJson = options.format === "json" || isJsonFlag();
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    const message = "PINATA_JWT env var is required for `agent pin`. Get a JWT at https://pinata.cloud and export PINATA_JWT=...";
    if (isJson) console.log(JSON.stringify({ error: message }));
    else console.error(colors.red(message));
    process.exitCode = 2;
    throw new Error(message);
  }

  // Validate dir exists.
  let stat;
  try {
    stat = statSync(options.dir);
  } catch (err) {
    const message = `dir not found: ${options.dir} (${(err as Error).message})`;
    if (isJson) console.log(JSON.stringify({ error: message }));
    else console.error(colors.red(message));
    process.exitCode = 2;
    throw new Error(message);
  }
  if (!stat.isDirectory()) {
    const message = `not a directory: ${options.dir}`;
    if (isJson) console.log(JSON.stringify({ error: message }));
    else console.error(colors.red(message));
    process.exitCode = 2;
    throw new Error(message);
  }

  const files = readDirRecursive(options.dir);
  if (files.length < 2) {
    const message = `directory must contain at least 2 files (Pinata flattens single-file directory pins). Found ${files.length} in ${options.dir}.`;
    if (isJson) console.log(JSON.stringify({ error: message }));
    else console.error(colors.red(message));
    process.exitCode = 2;
    throw new Error(message);
  }

  // If --policy is set, locate (or read from stdin) the policy bytes BEFORE
  // calling Pinata so a missing-file error doesn't leave the operator with
  // an orphan pin.
  let policyBytes: Uint8Array | undefined;
  let policyRelpath: string | undefined;
  if (options.policy !== undefined) {
    if (options.policy === "-") {
      policyBytes = readStdinSync();
      policyRelpath = "<stdin>";
      if (policyBytes.length === 0) {
        const message = "--policy - requires non-empty bytes on stdin";
        if (isJson) console.log(JSON.stringify({ error: message }));
        else console.error(colors.red(message));
        process.exitCode = 2;
        throw new Error(message);
      }
    } else {
      // Look up the policy in the files we just read so the bytes match
      // exactly what Pinata is about to receive — no chance of a TOCTOU
      // mismatch where the file is rewritten between read and pin.
      const f = files.find((x) => x.relpath === options.policy);
      if (!f) {
        const message = `--policy ${options.policy} not found inside ${options.dir} (relative paths only)`;
        if (isJson) console.log(JSON.stringify({ error: message }));
        else console.error(colors.red(message));
        process.exitCode = 2;
        throw new Error(message);
      }
      policyBytes = f.bytes;
      policyRelpath = options.policy;
    }
  }

  const metadataName = options.metadataName ?? basename(options.dir);

  if (!isJson) {
    startSpinner(`Pinning ${files.length} file(s) from ${colors.cyan(options.dir)} to Pinata...`);
  }

  let pinned: PinDirectoryResult;
  try {
    pinned = await pinDirectory(files, {
      jwt,
      metadataName,
      gateway: options.gateway,
    });
  } catch (err) {
    stopSpinner();
    const message = (err as Error).message;
    if (isJson) console.log(JSON.stringify({ error: message }));
    else console.error(colors.red(message));
    process.exitCode = 1;
    throw err;
  }

  stopSpinner();

  // Compute policy hash AFTER pin so a hash-only failure doesn't leave the
  // operator without a CID. Hash is purely local — it can be recomputed
  // any time, but the CID can't.
  let policyHash: string | undefined;
  if (policyBytes) {
    const obj = JSON.parse(new TextDecoder().decode(policyBytes));
    policyHash = keccak256(toHex(canonicalizeBytes(obj)));
  }

  // Post-pin gateway probe (default on). Surfaces transient pin failures
  // before downstream `agent publish` writes a record pointing at unreachable
  // bytes.
  let verified = !!options.noVerify; // if --no-verify, treat as "skipped" but report verified=true
  if (!options.noVerify) {
    if (!isJson) {
      startSpinner(`Probing ${pinned.files.length} files via gateway...`);
    }
    const fail = await verifyPinResolves(pinned);
    stopSpinner();
    if (fail) {
      const message = `gateway probe failed: ${fail.relpath} → ${fail.reason}`;
      if (isJson) {
        console.log(JSON.stringify({ ...pinned, policyHash, policyRelpath, verified: false, error: message }, null, 2));
      } else {
        console.error(colors.red(`✗ ${message}`));
      }
      process.exitCode = 1;
      throw new Error(message);
    }
    verified = true;
  }

  const result: PinResult = {
    ...pinned,
    policyHash,
    policyRelpath,
    verified,
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log();
    console.log(colors.bold("  Pin Result"));
    console.log(colors.dim("  ──────────"));
    console.log(`    CID            : ${colors.cyan(result.cid)}`);
    console.log(`    Files          : ${result.files.length}`);
    console.log(`    Metadata name  : ${metadataName}`);
    console.log(`    Verified       : ${verified ? colors.green("yes") : colors.dim("skipped (--no-verify)")}`);
    if (policyHash) {
      console.log(`    Policy hash    : ${colors.green(policyHash)}`);
      console.log(`    Policy file    : ${colors.dim(policyRelpath ?? "?")}`);
    }
    console.log();
    if (options.explain) {
      console.log(colors.bold("  IPFS URIs"));
      console.log(colors.dim("  ─────────"));
      for (const f of result.files) {
        console.log(`    ${colors.dim(f.relpath)}`);
        console.log(`      ${f.ipfsUri}`);
      }
      console.log();
    }
  }

  process.exitCode = 0;
  return result;
}
