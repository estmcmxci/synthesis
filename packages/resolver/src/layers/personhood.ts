import { createPublicClient, http, toHex, type Address } from "viem";
import { base, worldchain } from "viem/chains";
import type { PersonhoodResult, AgentBookNetwork } from "../schema.js";

const AGENT_BOOK_ABI = [
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "lookupHuman",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const AGENT_BOOK_DEPLOYMENTS: Record<
  AgentBookNetwork,
  { address: Address; chain: typeof base | typeof worldchain }
> = {
  base: {
    address: "0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4",
    chain: base,
  },
  world: {
    address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA",
    chain: worldchain,
  },
  "base-sepolia": {
    address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA",
    chain: base, // uses base chain config with sepolia RPC override
  },
};

export interface ResolvePersonhoodOptions {
  networks?: AgentBookNetwork[];
  rpcUrl?: string;
}

/**
 * Resolve proof-of-personhood for an address by querying AgentBook contracts.
 *
 * Checks each network in order and returns on the first match.
 * Returns { verified: false } if not registered on any network.
 */
export async function resolvePersonhood(
  address: Address,
  options: ResolvePersonhoodOptions = {},
): Promise<PersonhoodResult> {
  const networks = options.networks ?? ["base", "world"];

  for (const network of networks) {
    const deployment = AGENT_BOOK_DEPLOYMENTS[network];
    if (!deployment) continue;

    try {
      const client = createPublicClient({
        chain: deployment.chain,
        transport: http(options.rpcUrl),
      });

      const humanId = await client.readContract({
        address: deployment.address,
        abi: AGENT_BOOK_ABI,
        functionName: "lookupHuman",
        args: [address],
      });

      if (humanId !== 0n) {
        return {
          verified: true,
          nullifierHash: toHex(humanId),
          network,
          agentBookAddress: deployment.address,
        };
      }
    } catch {
      // RPC error on this network — try the next one
      continue;
    }
  }

  return {
    verified: false,
    nullifierHash: null,
    network: null,
    agentBookAddress: null,
  };
}
