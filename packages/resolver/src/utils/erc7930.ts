/**
 * ERC-7930 Interoperable Address Encoding/Decoding
 *
 * Encodes chain ID + contract address into ERC-7930 v1 format
 * for constructing ENSIP-25 `agent-registration[registry][agentId]` keys.
 *
 * Format (ERC-7930 v1):
 *   Version (2 bytes)  | ChainType (2 bytes) | ChainRefLen (1 byte) | ChainRef (variable) | AddrLen (1 byte) | Address (variable)
 *   0x0001             | 0x0000 (EVM)        | N                    | chain ID bytes       | 0x14 (20)        | 20 bytes
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-7930
 */

const VERSION = "0001";
const CHAIN_TYPE_EVM = "0000";
const EVM_ADDR_LENGTH = "14"; // 20 bytes = 0x14

/**
 * Encode a chain ID + address into ERC-7930 v1 format (EVM).
 *
 * Returns the hex string WITHOUT the 0x prefix (for use in ENSIP-25 keys).
 */
export function encodeErc7930Address(
  chainId: number,
  contractAddress: string,
): string {
  const addr = contractAddress.replace("0x", "").toLowerCase();

  // Chain reference: chain ID as minimal big-endian hex bytes
  const chainHex = chainId.toString(16);
  const chainRef = chainHex.length % 2 ? "0" + chainHex : chainHex;
  const chainRefLen = (chainRef.length / 2).toString(16).padStart(2, "0");

  return VERSION + CHAIN_TYPE_EVM + chainRefLen + chainRef + EVM_ADDR_LENGTH + addr;
}

/**
 * Decode an ERC-7930 v1 encoded address hex string.
 *
 * Accepts with or without 0x prefix.
 * Returns { chainId, address } or null if the format is invalid.
 */
export function decodeErc7930Address(
  encoded: string,
): { chainId: number; address: string } | null {
  const hex = encoded.replace("0x", "").toLowerCase();
  const bytes = hexToBytes(hex);
  if (!bytes || bytes.length < 7) return null; // minimum: 2 + 2 + 1 + 0 + 1 + 1

  // Version check
  if (bytes[0] !== 0x00 || bytes[1] !== 0x01) return null;

  // Chain type (we only support EVM = 0x0000)
  if (bytes[2] !== 0x00 || bytes[3] !== 0x00) return null;

  // Chain reference length
  const chainRefLen = bytes[4];
  const chainRefStart = 5;
  const chainRefEnd = chainRefStart + chainRefLen;

  if (chainRefEnd >= bytes.length) return null;

  // Parse chain ID from big-endian bytes
  let chainId = 0;
  for (let i = chainRefStart; i < chainRefEnd; i++) {
    chainId = (chainId << 8) | bytes[i];
  }

  // Address length
  const addrLen = bytes[chainRefEnd];
  const addrStart = chainRefEnd + 1;
  const addrEnd = addrStart + addrLen;

  if (addrEnd > bytes.length) return null;

  const addrBytes = bytes.slice(addrStart, addrEnd);
  const address =
    "0x" + addrBytes.map((b) => b.toString(16).padStart(2, "0")).join("");

  return { chainId, address };
}

/**
 * Build an ENSIP-25 text record key for agent registration.
 *
 * Format per spec: `agent-registration[0x<erc7930>][<agentId>]`
 */
export function buildEnsip25Key(
  chainId: number,
  registryAddress: string,
  agentId: string,
): string {
  const erc7930 = encodeErc7930Address(chainId, registryAddress);
  return `agent-registration[0x${erc7930}][${agentId}]`;
}

/**
 * Parse an ENSIP-25 text record key back into its components.
 *
 * Returns null if the key doesn't match the expected pattern.
 */
export function parseEnsip25Key(
  key: string,
): { chainId: number; registryAddress: string; agentId: string } | null {
  const match = key.match(
    /^agent-registration\[(?:0x)?([a-f0-9]+)\]\[([^\[\]]+)\]$/i,
  );
  if (!match) return null;

  const decoded = decodeErc7930Address(match[1]);
  if (!decoded) return null;

  return {
    chainId: decoded.chainId,
    registryAddress: decoded.address,
    agentId: match[2],
  };
}

/**
 * Well-known Adapter8004 deployments (unruggable-labs canonical proxies).
 *
 * The adapter is not an ENSIP-25 registry itself — agents registered through
 * it are minted on the chain's canonical ERC-8004 registry (the adapter's
 * `identityRegistry()`), so ENSIP-25 keys keep the registry address. The
 * adapter is consulted at verification time via `bindingOf(agentId)` to
 * prove the agent is bound to a specific NameWrapper token, i.e. to a
 * specific ENS name. Keyed by chain ID.
 *
 * UUPS proxies governed by the unruggable multisig Safe
 * (0x03302Df40186D9B85faEA4fbb6cC5da028B23149) — an accepted upgrade
 * dependency; re-verify live implementations before relying on behavior
 * not covered by tests.
 */
export const KNOWN_ADAPTERS: Record<number, `0x${string}`> = {
  /** Ethereum mainnet */
  1: "0xde152AfB7db5373F34876E1499fbD893A82dD336",
  /** Base mainnet */
  8453: "0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27",
  /** Sepolia */
  11155111: "0x7621630cB63a73a194f45A3E6801B8C6A7eC2f92",
};

/** Well-known registries */
export const KNOWN_REGISTRIES = {
  /** ERC-8004 on Base mainnet */
  "8004-base": {
    chainId: 8453,
    address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
  },
  /** ERC-8004 on Ethereum mainnet */
  "8004-ethereum": {
    chainId: 1,
    address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
  },
  /** AgentBook on Base mainnet */
  "agentbook-base": {
    chainId: 8453,
    address: "0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4" as const,
  },
  /** AgentBook on World Chain */
  "agentbook-world": {
    chainId: 480,
    address: "0xA23aB2712eA7BBa896930544C7d6636a96b944dA" as const,
  },
} as const;

function hexToBytes(hex: string): number[] | null {
  if (hex.length % 2 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}
