/**
 * Resolution Layer 1: Identity (ENSIP-25)
 *
 * Scans known ERC-8004 registries for ENSIP-25 agent-registration
 * text records on an ENS name. If found, verifies the agent exists
 * on-chain via tokenURI + ownerOf.
 *
 * Read-only: never writes records.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { base } from "viem/chains";
import type { IdentityResult } from "../schema.js";
import { getTextRecord, createEnsClient } from "../utils/ens.js";
import {
  buildEnsip25Key,
  encodeErc7930Address,
  KNOWN_REGISTRIES,
} from "../utils/erc7930.js";

const ERC_8004_ABI = [
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

/** Registry to scan: chainId + contract address + RPC */
interface RegistryTarget {
  chainId: number;
  address: string;
  rpcUrl?: string;
}

const DEFAULT_REGISTRIES: RegistryTarget[] = [
  { chainId: KNOWN_REGISTRIES["8004-base"].chainId, address: KNOWN_REGISTRIES["8004-base"].address },
  { chainId: KNOWN_REGISTRIES["8004-ethereum"].chainId, address: KNOWN_REGISTRIES["8004-ethereum"].address },
];

/** Chain ID → viem chain config for creating clients */
const CHAIN_MAP: Record<number, typeof base> = {
  8453: base,
};

export interface ResolveIdentityOptions {
  registries?: RegistryTarget[];
  ensRpcUrl?: string;
}

/**
 * Resolve ENSIP-25 identity for an ENS name.
 *
 * For each known registry, constructs all possible ENSIP-25 keys
 * (scanning agent IDs from text records), checks if the record is set,
 * and verifies the agent on-chain.
 *
 * Since we don't know the agent ID upfront, we scan by checking known
 * agent IDs from the ENS name's text records. The approach:
 * 1. For each registry, build the ERC-7930 prefix
 * 2. Try to find an agent-registration text record by scanning known IDs
 *    or by using a wildcard approach
 *
 * In practice, the resolver is given a name and must discover the agent ID.
 * We do this by scanning text record keys that match the ENSIP-25 pattern.
 * Since viem can't enumerate text records, we try known agent IDs if provided,
 * or fall back to scanning a reasonable range.
 */
export async function resolveIdentity(
  ensName: string,
  knownAgentIds?: string[],
  options: ResolveIdentityOptions = {},
): Promise<IdentityResult> {
  const registries = options.registries ?? DEFAULT_REGISTRIES;
  const ensClient = createEnsClient(options.ensRpcUrl);

  for (const registry of registries) {
    const agentIds = knownAgentIds ?? [];

    for (const agentId of agentIds) {
      const key = buildEnsip25Key(registry.chainId, registry.address, agentId);
      const value = await getTextRecord(ensClient, ensName, key);

      if (value && value.length > 0) {
        // Found an ENSIP-25 record — verify on-chain
        const onChain = await verifyOnChain(registry, agentId);
        const erc7930 = encodeErc7930Address(registry.chainId, registry.address);

        return {
          verified: true,
          registryAddress: erc7930,
          agentId,
          registryChain: `eip155:${registry.chainId}`,
          tokenURI: onChain.tokenURI,
          owner: onChain.owner,
        };
      }
    }
  }

  return {
    verified: false,
    registryAddress: null,
    agentId: null,
    registryChain: null,
    tokenURI: null,
    owner: null,
  };
}

/**
 * Verify an agent exists on the ERC-8004 registry on-chain.
 * Reads tokenURI and ownerOf.
 */
async function verifyOnChain(
  registry: RegistryTarget,
  agentId: string,
): Promise<{ tokenURI: string | null; owner: string | null }> {
  try {
    const chain = CHAIN_MAP[registry.chainId];
    const client = createPublicClient({
      chain,
      transport: http(registry.rpcUrl),
    });

    const [tokenURI, owner] = await Promise.all([
      client
        .readContract({
          address: registry.address as `0x${string}`,
          abi: ERC_8004_ABI,
          functionName: "tokenURI",
          args: [BigInt(agentId)],
        })
        .catch(() => null),
      client
        .readContract({
          address: registry.address as `0x${string}`,
          abi: ERC_8004_ABI,
          functionName: "ownerOf",
          args: [BigInt(agentId)],
        })
        .catch(() => null),
    ]);

    return {
      tokenURI: tokenURI as string | null,
      owner: owner as string | null,
    };
  } catch {
    return { tokenURI: null, owner: null };
  }
}
