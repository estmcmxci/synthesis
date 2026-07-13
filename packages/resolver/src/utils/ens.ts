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
import { labelhash, normalize } from "viem/ens";
import { mainnet } from "viem/chains";

const DEFAULT_RPC = "https://eth.drpc.org";

// Mainnet ENS Registry (deterministic across networks that use the canonical deployment)
const ENS_REGISTRY_ADDRESS: Address =
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

// Mainnet NameWrapper. Sepolia uses 0x0635513f179D50A207757E05759CbD106d7dFcE8;
// the resolver is mainnet-only today, so we only check the mainnet address here.
// Exported for the identity layer's Adapter8004 binding cross-check.
export const NAME_WRAPPER_ADDRESS: Address =
  "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

// Mainnet BaseRegistrar (.eth). Owns all unwrapped .eth 2LDs at the registry
// level; the actual controller is BaseRegistrar.ownerOf(uint256(labelhash)).
const BASE_REGISTRAR_ADDRESS: Address =
  "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85";

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

const BASE_REGISTRAR_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
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
 * Read the resolver address for an ENS name from the registry.
 *
 * Returns null if the name has no resolver set (registry returns
 * `address(0)`), and throws on RPC transport failure. The contrast with
 * `getOwner` / `getTextRecords` (which both swallow errors and return
 * empty/null fallbacks) is intentional: callers that need to distinguish
 * "name does not exist" from "RPC failed" should use this function as
 * the authoritative signal — a successful read returning null is the
 * only positive proof of nonexistence.
 */
export async function getResolverAddress(
  client: PublicClient,
  name: string,
): Promise<Address | null> {
  const node = namehash(normalizeName(name));
  const resolver = (await client.readContract({
    address: ENS_REGISTRY_ADDRESS,
    abi: [
      {
        type: "function",
        name: "resolver",
        stateMutability: "view",
        inputs: [{ name: "node", type: "bytes32" }],
        outputs: [{ name: "", type: "address" }],
      },
    ] as const,
    functionName: "resolver",
    args: [node],
  })) as Address;
  return resolver === zeroAddress ? null : resolver;
}

/**
 * Get the registry owner of an ENS name — the address that controls the
 * name and is authorized to sign records on its behalf.
 *
 * Resolution chain:
 * 1. `Registry.owner(node)` → registry owner.
 * 2. If owner is the NameWrapper, unwrap via `NameWrapper.ownerOf(uint256(node))`.
 * 3. If owner is the BaseRegistrar (unwrapped `.eth` 2LDs), look up the true
 *    controller via `BaseRegistrar.ownerOf(uint256(labelhash(label)))` —
 *    the registry owner for these names is the registrar contract itself,
 *    not the user.
 * 4. Otherwise, return the registry owner.
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
    const normalized = normalizeName(name);
    const node = namehash(normalized);
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

    if (registryOwner.toLowerCase() === BASE_REGISTRAR_ADDRESS.toLowerCase()) {
      // BaseRegistrar issues NFT-style ownership of `.eth` 2LDs; the tokenId
      // is the labelhash of the leftmost label (e.g. "alice" for "alice.eth").
      // Only valid for two-label `.eth` names — guard against mis-routing
      // deeper subnames whose registry owner happens to be the registrar.
      const labels = normalized.split(".");
      if (labels.length !== 2 || labels[1] !== "eth") return null;

      const baseOwner = (await client.readContract({
        address: BASE_REGISTRAR_ADDRESS,
        abi: BASE_REGISTRAR_ABI,
        functionName: "ownerOf",
        args: [BigInt(labelhash(labels[0]))],
      })) as Address;
      return baseOwner === zeroAddress ? null : baseOwner;
    }

    return registryOwner;
  } catch {
    return null;
  }
}
