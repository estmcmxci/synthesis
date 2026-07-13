/**
 * Resolution Layer 1: Identity (ENSIP-25)
 *
 * Scans known ERC-8004 registries for ENSIP-25 agent-registration
 * text records on an ENS name. If found, verifies the agent exists
 * on-chain via tokenURI + ownerOf, then — when the registry's chain has a
 * known Adapter8004 deployment — cross-checks `bindingOf(agentId)` against
 * the ENS name's wrapped NameWrapper token. An adapter-managed agent that
 * is provably bound to a *different* token than `namehash(ensName)` is
 * rejected outright: existence alone must not verify someone else's agent.
 *
 * Read-only: never writes records.
 */

import {
  createPublicClient,
  http,
  namehash,
  BaseError,
  ContractFunctionRevertedError,
  type PublicClient,
} from "viem";
import { base, mainnet, sepolia } from "viem/chains";
import type { IdentityBinding, IdentityResult } from "../schema.js";
import {
  getTextRecord,
  createEnsClient,
  normalizeName,
  NAME_WRAPPER_ADDRESS,
} from "../utils/ens.js";
import {
  buildEnsip25Key,
  encodeErc7930Address,
  KNOWN_ADAPTERS,
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

/**
 * Adapter8004 read surface (unruggable-labs). ABI derived from
 * github.com/unruggable-labs/adapter `src/Adapter8004.sol` +
 * `src/interfaces/IERCAgentBindings.sol`; selectors verified present in the
 * deployed implementation bytecode on mainnet/Base/Sepolia (2026-07-13).
 */
const ADAPTER_8004_ABI = [
  {
    name: "identityRegistry",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "bindingOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "standard", type: "uint8" },
          { name: "tokenContract", type: "address" },
          { name: "tokenId", type: "uint256" },
        ],
      },
    ],
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
  1: mainnet as unknown as typeof base,
  8453: base,
  11155111: sepolia as unknown as typeof base,
};

/**
 * Result of consulting an Adapter8004 deployment about an agentId.
 *
 * - `bound` — the adapter holds a binding record for this agentId.
 * - `unbound` — `bindingOf` reverted (`UnknownAgent`): the agent is not
 *   adapter-managed. Legacy existence-only verification applies.
 * - `unavailable` — the adapter could not be consulted (transport error).
 *   Verification degrades to existence-only, without rejecting the claim.
 */
export type AdapterBindingProbe =
  | {
      outcome: "bound";
      identityRegistry: string;
      tokenContract: string;
      tokenId: string;
    }
  | { outcome: "unbound" }
  | { outcome: "unavailable" };

export interface ResolveIdentityOptions {
  registries?: RegistryTarget[];
  ensRpcUrl?: string;
  /**
   * Adapter8004 deployment per chain ID, consulted for the binding
   * cross-check. Defaults to the canonical unruggable-labs proxies
   * (KNOWN_ADAPTERS). Pass `{}` to disable the adapter check entirely.
   */
  adapters?: Record<number, string>;
  /**
   * NameWrapper address the binding's tokenContract must equal. Defaults to
   * mainnet NameWrapper — override when resolving names on another ENS
   * deployment (e.g. Sepolia).
   */
  nameWrapperAddress?: string;
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
    /**
     * Stub for the Adapter8004 probe. When testHooks are set but this hook
     * is omitted, the probe resolves to `unavailable` (never hits the
     * network) — verification degrades to existence-only.
     */
    probeBinding?: (
      registry: RegistryTarget,
      agentId: string,
      adapterAddress: string,
    ) => Promise<AdapterBindingProbe>;
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
 * When the registry's chain has a known Adapter8004, `bindingOf(agentId)`
 * is additionally cross-checked: `tokenContract` must be the NameWrapper
 * and `tokenId` must be `namehash(ensName)`. A binding that resolves to a
 * different token rejects the pair — anyone with text-record write access
 * can *claim* an agentId, but only the wrapped name's holder can have
 * registered it through the adapter.
 */
export async function resolveIdentity(
  ensName: string,
  knownAgentIds?: string[],
  options: ResolveIdentityOptions = {},
): Promise<IdentityResult> {
  const registries = options.registries ?? DEFAULT_REGISTRIES;
  const adapters = options.adapters ?? KNOWN_ADAPTERS;
  const nameWrapper = (options.nameWrapperAddress ?? NAME_WRAPPER_ADDRESS).toLowerCase();
  const readText = options.testHooks
    ? options.testHooks.readTextRecord
    : (() => {
        const ensClient = createEnsClient(options.ensRpcUrl);
        return (name: string, key: string) => getTextRecord(ensClient, name, key);
      })();

  // The wrapped NameWrapper token ID an adapter binding must resolve to.
  // Unnormalizable names can't hold records, so failure here is unreachable
  // in practice — but degrade to "no expected id" rather than throwing.
  let expectedTokenId: bigint | null = null;
  try {
    expectedTokenId = BigInt(namehash(normalizeName(ensName)));
  } catch {
    expectedTokenId = null;
  }

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
        //
        // When `testHooks` is set, the contract is "no live network calls".
        // If the caller stubs `readTextRecord` but not `verifyOnChain`,
        // default to a null-returning stub rather than dropping into real
        // RPC — otherwise a partially-stubbed test would silently hit the
        // network the moment any ENSIP-25 record matched.
        const onChain = options.testHooks
          ? options.testHooks.verifyOnChain
            ? await options.testHooks.verifyOnChain(registry, agentId)
            : { tokenURI: null, owner: null }
          : await verifyOnChain(registry, agentId);
        if (onChain.tokenURI === null || onChain.owner === null) {
          continue;
        }

        // Adapter8004 binding cross-check. Same no-live-network contract as
        // verifyOnChain: a partially-stubbed test gets `unavailable`, never
        // real RPC.
        const adapterAddress = adapters[registry.chainId];
        let binding: IdentityBinding | null = null;
        if (adapterAddress) {
          const probe = options.testHooks
            ? options.testHooks.probeBinding
              ? await options.testHooks.probeBinding(registry, agentId, adapterAddress)
              : ({ outcome: "unavailable" } as const)
            : await probeAdapterBinding(registry, agentId, adapterAddress);

          if (probe.outcome === "bound") {
            const boundToThisName =
              expectedTokenId !== null &&
              probe.tokenContract.toLowerCase() === nameWrapper &&
              BigInt(probe.tokenId) === expectedTokenId;
            const registryMatches =
              probe.identityRegistry.toLowerCase() === registry.address.toLowerCase();
            const adapterHoldsAgent =
              onChain.owner.toLowerCase() === adapterAddress.toLowerCase();

            if (registryMatches && adapterHoldsAgent) {
              if (!boundToThisName) {
                // Adapter-managed agent provably bound to a different token
                // than this name's wrapped NameWrapper token. This is the
                // trust gap ENSIP-25 self-assertion leaves open — reject the
                // pair instead of falling back to existence-only.
                continue;
              }
              binding = {
                passed: true,
                adapterAddress,
                tokenContract: probe.tokenContract,
                tokenId: probe.tokenId,
                reason: null,
              };
            } else {
              // Inconsistent adapter state (registry repointed since the
              // binding was written, or the agent token left the adapter).
              // Neither proves nor disproves the claim — degrade to
              // existence-only, without elevating the binding.
              binding = {
                passed: false,
                adapterAddress,
                tokenContract: probe.tokenContract,
                tokenId: probe.tokenId,
                reason: registryMatches
                  ? "registry owner of agent is not the adapter — binding not authoritative"
                  : "adapter identityRegistry does not match claimed registry — binding not comparable",
              };
            }
          } else if (probe.outcome === "unavailable") {
            binding = {
              passed: false,
              adapterAddress,
              tokenContract: null,
              tokenId: null,
              reason: "adapter unreachable — binding unverified",
            };
          }
          // `unbound` → not adapter-managed → binding stays null (legacy).
        }

        const erc7930 = encodeErc7930Address(registry.chainId, registry.address);

        return {
          verified: true,
          registryAddress: erc7930,
          agentId,
          registryChain: `eip155:${registry.chainId}`,
          tokenURI: onChain.tokenURI,
          owner: onChain.owner,
          binding,
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
    binding: null,
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
    const client = createRegistryClient(registry);

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

/**
 * Consult the chain's Adapter8004 about an agentId.
 *
 * A revert on `bindingOf` (the adapter's `UnknownAgent`) means the agent is
 * not adapter-managed — distinct from a transport failure, which must not
 * be mistaken for "unbound" (that would silently drop the stronger check
 * whenever the RPC flakes, and a mismatch-reject on flaky transport would
 * break resolution for honest names).
 *
 * Exported for verifier surfaces that want the raw probe (e.g. the site's
 * agent card) — `resolveIdentity` applies the policy on top of it.
 */
export async function probeAdapterBinding(
  registry: RegistryTarget,
  agentId: string,
  adapterAddress: string,
): Promise<AdapterBindingProbe> {
  let client: PublicClient;
  try {
    client = createRegistryClient(registry);
  } catch {
    return { outcome: "unavailable" };
  }

  let bindingRaw: { standard: number; tokenContract: string; tokenId: bigint };
  try {
    bindingRaw = (await client.readContract({
      address: adapterAddress as `0x${string}`,
      abi: ADAPTER_8004_ABI,
      functionName: "bindingOf",
      args: [BigInt(agentId)],
    })) as { standard: number; tokenContract: string; tokenId: bigint };
  } catch (err) {
    const reverted =
      err instanceof BaseError &&
      err.walk((e) => e instanceof ContractFunctionRevertedError) !== null;
    return reverted ? { outcome: "unbound" } : { outcome: "unavailable" };
  }

  try {
    const identityRegistry = (await client.readContract({
      address: adapterAddress as `0x${string}`,
      abi: ADAPTER_8004_ABI,
      functionName: "identityRegistry",
    })) as string;

    return {
      outcome: "bound",
      identityRegistry,
      tokenContract: bindingRaw.tokenContract,
      tokenId: bindingRaw.tokenId.toString(),
    };
  } catch {
    return { outcome: "unavailable" };
  }
}

function createRegistryClient(registry: RegistryTarget): PublicClient {
  const chain = CHAIN_MAP[registry.chainId];
  if (!chain && !registry.rpcUrl) {
    throw new Error(`No chain config or rpcUrl for chain ${registry.chainId}`);
  }
  return createPublicClient({
    chain,
    transport: http(registry.rpcUrl),
  }) as PublicClient;
}
