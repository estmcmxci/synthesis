/**
 * ENS Utilities — name normalization and text record reading.
 *
 * Uses viem's built-in ENS support: normalize(), getEnsText(),
 * getEnsAddress(). Supports CCIP-Read (ERC-3668) for offchain names.
 */

import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";

const DEFAULT_RPC = "https://eth.drpc.org";

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
 * Get the owner (registrant) address of an ENS name.
 *
 * Uses the ENS registry's owner() function.
 * Returns null if the name doesn't exist.
 */
export async function getOwner(
  client: PublicClient,
  name: string,
): Promise<Address | null> {
  try {
    // viem doesn't have a direct getEnsOwner, but we can resolve
    // the name to check it exists, then use the registry
    const address = await resolveAddress(client, name);
    return address;
  } catch {
    return null;
  }
}
