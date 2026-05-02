/**
 * ENS Utilities — name normalization and text record reading.
 *
 * Uses viem's built-in ENS support: normalize(), getEnsText(),
 * getEnsAddress(). Supports CCIP-Read (ERC-3668) for offchain names.
 */

import {
  createPublicClient,
  http,
  namehash,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";

const DEFAULT_RPC = "https://eth.drpc.org";

// Mainnet ENS Registry (deterministic across networks that use the canonical deployment)
const ENS_REGISTRY_ADDRESS: Address =
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

// Mainnet NameWrapper. Sepolia uses 0x0635513f179D50A207757E05759CbD106d7dFcE8;
// the resolver is mainnet-only today, so we only check the mainnet address here.
const NAME_WRAPPER_ADDRESS: Address =
  "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

const REGISTRY_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const NAME_WRAPPER_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/**
 * Create a public client configured for ENS resolution on mainnet.
 *
 * Priority: explicit rpcUrl > ETH_RPC_URL env var > default (eth.drpc.org)
 */
export function createEnsClient(rpcUrl?: string): PublicClient {
  const url = rpcUrl ?? process.env.ETH_RPC_URL ?? DEFAULT_RPC;
  return createPublicClient({
    chain: mainnet,
    transport: http(url),
  });
}

/**
 * Normalize an ENS name per ENSIP-1.
 *
 * Handles Unicode normalization, label validation, and dot separation.
 * Throws if the name is invalid.
 */
export function normalizeName(name: string): string {
  return normalize(name);
}

/**
 * Read a single text record from an ENS name.
 *
 * Supports CCIP-Read (ERC-3668) for offchain resolvers.
 * Returns null if the record is not set or the name doesn't exist.
 */
export async function getTextRecord(
  client: PublicClient,
  name: string,
  key: string,
): Promise<string | null> {
  try {
    const value = await client.getEnsText({
      name: normalizeName(name),
      key,
    });
    return value ?? null;
  } catch {
    return null;
  }
}

/**
 * Read multiple text records from an ENS name in parallel.
 *
 * Returns a record of key → value, omitting keys with no value set.
 */
export async function getTextRecords(
  client: PublicClient,
  name: string,
  keys: string[],
): Promise<Record<string, string>> {
  const normalized = normalizeName(name);
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const value = await client.getEnsText({ name: normalized, key });
        return [key, value ?? null] as const;
      } catch {
        return [key, null] as const;
      }
    }),
  );

  const records: Record<string, string> = {};
  for (const [key, value] of results) {
    if (value !== null) {
      records[key] = value;
    }
  }
  return records;
}

/**
 * Resolve an ENS name to an Ethereum address.
 *
 * Returns null if the name doesn't resolve.
 */
export async function resolveAddress(
  client: PublicClient,
  name: string,
): Promise<Address | null> {
  try {
    const address = await client.getEnsAddress({
      name: normalizeName(name),
    });
    return address ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the registry owner of an ENS name — the address that controls the
 * name and is authorized to sign records on its behalf.
 *
 * Reads `Registry.owner(node)`. If the registry owner is the NameWrapper,
 * unwraps via `NameWrapper.ownerOf(uint256(node))` to return the true owner.
 *
 * This is the right address for verifying record signatures (AIP manifests,
 * ENSIP-25 links, etc.) — distinct from `addr()`, which is the payment
 * address and may be a smart contract that does not control the name.
 *
 * Returns null if the name is unowned or the lookup fails.
 */
export async function getOwner(
  client: PublicClient,
  name: string,
): Promise<Address | null> {
  try {
    const node = namehash(normalizeName(name));
    const registryOwner = (await client.readContract({
      address: ENS_REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: "owner",
      args: [node],
    })) as Address;

    if (registryOwner === zeroAddress) return null;

    if (registryOwner.toLowerCase() === NAME_WRAPPER_ADDRESS.toLowerCase()) {
      const wrappedOwner = (await client.readContract({
        address: NAME_WRAPPER_ADDRESS,
        abi: NAME_WRAPPER_ABI,
        functionName: "ownerOf",
        args: [BigInt(node)],
      })) as Address;
      return wrappedOwner === zeroAddress ? null : wrappedOwner;
    }

    return registryOwner;
  } catch {
    return null;
  }
}
