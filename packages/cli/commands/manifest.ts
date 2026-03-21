/**
 * Manifest Commands — AIP V2 Manifest Lifecycle
 *
 * Create, pin, and verify AIP manifests.
 */

import colors from "yoctocolors";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";
import {
  resolveManifest,
  type AgentManifest,
} from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface ManifestCreateOptions {
  name: string;
  version: string;
  prev?: string;
  payload?: string;
  output?: string;
}

export interface ManifestPinOptions {
  file: string;
}

export interface ManifestVerifyOptions {
  name: string;
  agentIds?: string[];
}

/**
 * Create an AIP manifest, sign with ENS_PRIVATE_KEY (EIP-191).
 */
export async function manifestCreate(options: ManifestCreateOptions) {
  const { name, version, prev, payload: payloadJson, output } = options;

  const privateKey = process.env.ENS_PRIVATE_KEY;
  if (!privateKey) {
    console.error(colors.red("Error: ENS_PRIVATE_KEY not set"));
    return;
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  // Parse payload if provided
  let payload: Record<string, unknown> = {};
  if (payloadJson) {
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      console.error(colors.red("Error: --payload must be valid JSON"));
      return;
    }
  }

  // Build manifest without signature
  const manifestBody = {
    schema: "ens.agent/1",
    ensName: name,
    version,
    prev: prev ?? null,
    payload,
  };

  // Canonical bytes: sorted keys, no whitespace
  const canonicalBytes = JSON.stringify(
    manifestBody,
    Object.keys(manifestBody).sort(),
  );

  // Compute manifestHash
  const hash = createHash("sha256").update(canonicalBytes).digest("hex");

  // Sign with EIP-191
  startSpinner("Signing manifest...");
  const signature = await account.signMessage({ message: canonicalBytes });
  stopSpinner();

  const manifest: AgentManifest = {
    ...manifestBody,
    manifestHash: `sha256:${hash}`,
    signature: {
      scheme: "evm-owner-signature",
      value: signature,
    },
  };

  const json = JSON.stringify(manifest, null, 2);

  if (output) {
    writeFileSync(output, json);
    console.log(colors.green("✓") + ` Manifest written to ${colors.cyan(output)}`);
  } else {
    console.log(json);
  }

  console.log();
  console.log(`  ${colors.blue("Signer:")} ${account.address}`);
  console.log(`  ${colors.blue("Hash:")} sha256:${hash}`);
  console.log(`  ${colors.blue("Version:")} ${version}`);
  console.log(`  ${colors.blue("Prev:")} ${prev ?? "null (genesis)"}`);
}

/**
 * Pin a manifest JSON file to IPFS via Pinata.
 */
export async function manifestPin(options: ManifestPinOptions) {
  const { file } = options;

  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) {
    console.error(colors.red("Error: PINATA_JWT not set"));
    return;
  }

  let content: string;
  try {
    content = readFileSync(file, "utf-8");
    JSON.parse(content); // validate JSON
  } catch {
    console.error(colors.red(`Error: cannot read or parse ${file}`));
    return;
  }

  startSpinner("Pinning to IPFS via Pinata...");

  try {
    const { PinataSDK } = await import("pinata");
    const pinata = new PinataSDK({ pinataJwt, pinataGateway: "" });
    const result = await pinata.upload.public.json(JSON.parse(content));
    stopSpinner();

    console.log(colors.green("✓") + " Pinned to IPFS");
    console.log(`  ${colors.blue("CID:")} ${result.cid}`);
    console.log(`  ${colors.blue("URI:")} ipfs://${result.cid}`);
    console.log(`  ${colors.blue("Gateway:")} https://gateway.pinata.cloud/ipfs/${result.cid}`);
  } catch (error) {
    stopSpinner();
    console.error(colors.red(`Error pinning: ${(error as Error).message}`));
  }
}

/**
 * Verify an AIP manifest for an ENS name.
 * Uses the resolver layer to fetch, verify signature, and walk lineage.
 */
export async function manifestVerify(options: ManifestVerifyOptions) {
  const { name } = options;

  startSpinner(`Verifying manifest for ${colors.cyan(name)}...`);

  const result = await resolveManifest(name);

  stopSpinner();

  if (!result.found) {
    console.log(colors.red("✗") + " No AIP manifest found");
    console.log(colors.dim("  Set agent-latest and agent-version-lineage on the root name."));
    return;
  }

  console.log(colors.green("✓") + ` Manifest found (${result.latestVersion})`);
  console.log(`  ${colors.blue("Lineage mode:")} ${result.lineageMode}`);

  if (result.manifest) {
    console.log(`  ${colors.blue("Schema:")} ${result.manifest.schema}`);
    console.log(`  ${colors.blue("ENS name:")} ${result.manifest.ensName}`);
    console.log(`  ${colors.blue("Version:")} ${result.manifest.version}`);
    console.log(`  ${colors.blue("Prev:")} ${result.manifest.prev ?? "null (genesis)"}`);
    if (result.manifest.manifestHash) {
      console.log(`  ${colors.blue("Hash:")} ${result.manifest.manifestHash}`);
    }
  }

  // Signature
  if (result.signatureValid) {
    console.log(`  ${colors.green("✓")} Signature valid`);
  } else {
    console.log(`  ${colors.red("✗")} Signature INVALID or unverifiable`);
  }

  // Lineage
  console.log(`  ${colors.blue("Lineage depth:")} ${result.lineageDepth}`);
  if (result.lineageIntact) {
    console.log(`  ${colors.green("✓")} Lineage intact`);
  } else {
    console.log(`  ${colors.yellow("⚠")} Lineage incomplete or broken`);
  }
}
