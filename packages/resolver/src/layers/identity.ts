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
  /**
   * Inject text-record reads + on-chain verification for tests. When
   * provided, no live network calls are made. The test hook receives the
   * ENS name and key (e.g. `agent-ids`, `agent-registration[…][…]`) and
   * should return the record value or null.
   */
  testHooks?: {
    readTextRecord: (ensName: string, key: string) => Promise<string | null>;
    verifyOnChain?: (
      registry: RegistryTarget,
      agentId: string,
    ) => Promise<{ tokenURI: string | null; owner: string | null }>;
  };
}

/**
 * Resolve ENSIP-25 identity for an ENS name.
 *
 * Discovery: ENS exposes no text-record enumeration, so the resolver can't
 * iterate over `agent-registration[<reg>][<id>]` keys directly. Instead, we
 * use the `agent-ids` text record as an on-chain index of all agent IDs
 * linked to this name — the same record `ensemble agent link` writes when
 * publishing an ENSIP-25 record. Format: a JSON array of agent-ID strings,
 * e.g. `["24994"]`. IDs supplied by the caller via `knownAgentIds` are
 * merged on top of the index, so callers can still pre-seed when the index
 * isn't published yet.
 *
 * For each (registry × agentId) pair we build the ENSIP-25 key, look it up
 * as a text record, and verify the agent on-chain via tokenURI + ownerOf.
 */
export async function resolveIdentity(
  ensName: string,
  knownAgentIds?: string[],
  options: ResolveIdentityOptions = {},
): Promise<IdentityResult> {
  const registries = options.registries ?? DEFAULT_REGISTRIES;
  const readText = options.testHooks
    ? options.testHooks.readTextRecord
    : (() => {
        const ensClient = createEnsClient(options.ensRpcUrl);
        return (name: string, key: string) => getTextRecord(ensClient, name, key);
      })();

  // Auto-discover agent IDs from the canonical `agent-ids` text record.
  // Best-effort: a malformed value or RPC error degrades to using only the
  // caller-supplied IDs rather than failing the whole layer.
  const indexed: string[] = [];
  const indexRaw = await readText(ensName, "agent-ids");
  if (indexRaw) {
    try {
      const parsed = JSON.parse(indexRaw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === "string" && id.length > 0) indexed.push(id);
        }
      }
    } catch {
      // Non-JSON values are treated as no index — write side enforces JSON.
    }
  }
  const merged = Array.from(new Set([...indexed, ...(knownAgentIds ?? [])]));

  for (const registry of registries) {
    for (const agentId of merged) {
      const key = buildEnsip25Key(registry.chainId, registry.address, agentId);
      const value = await readText(ensName, key);

      if (value && value.length > 0) {
        // Found an ENSIP-25 record — verify on-chain. Both `tokenURI` and
        // `owner` must read successfully before we elevate to verified.
        // verifyOnChain returns null fields for burned/nonexistent token
        // IDs OR for transient RPC failures; treating either as a pass
        // would let a stale `agent-ids` index falsely elevate trust. If
        // this entry doesn't verify cleanly, `continue` so the scan can
        // still find a valid (registry, id) pair further down the index.
        const onChain = options.testHooks?.verifyOnChain
          ? await options.testHooks.verifyOnChain(registry, agentId)
          : await verifyOnChain(registry, agentId);
        if (onChain.tokenURI === null || onChain.owner === null) {
          continue;
        }
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
