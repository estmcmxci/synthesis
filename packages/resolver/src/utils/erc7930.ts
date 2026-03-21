/**
 * ERC-7930 Address Encoding/Decoding
 *
 * Encodes chain ID + contract address into ERC-7930 interoperable format
 * for constructing ENSIP-25 `agent-registration[registry][agentId]` keys.
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-7930
 */

/**
 * Encode a chain ID as minimal ULEB128 bytes.
 */
export function chainIdToUleb128(chainId: number): number[] {
  const bytes: number[] = [];
  let value = chainId;
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}

/**
 * Decode ULEB128 bytes back to a chain ID.
 * Returns [chainId, bytesConsumed].
 */
export function uleb128ToChainId(bytes: number[]): [number, number] {
  let value = 0;
  let shift = 0;
  let i = 0;
  for (; i < bytes.length; i++) {
    value |= (bytes[i] & 0x7f) << shift;
    shift += 7;
    if ((bytes[i] & 0x80) === 0) break;
  }
  return [value, i + 1];
}

/**
 * Build an ERC-7930 encoded address hex string from chain ID and contract address.
 *
 * Format: 0x80 + ULEB128(chainId) + 0x01 (addr type = 20-byte) + 20-byte address
 */
export function encodeErc7930Address(
  chainId: number,
  contractAddress: string,
): string {
  const chainBytes = chainIdToUleb128(chainId);
  const addrHex = contractAddress.replace("0x", "").toLowerCase();
  const addrBytes = addrHex.match(/.{2}/g)!.map((b) => parseInt(b, 16));
  const payload = [0x80, ...chainBytes, 0x01, ...addrBytes];
  return payload.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Decode an ERC-7930 encoded address hex string.
 *
 * Returns { chainId, address } or null if the format is invalid.
 */
export function decodeErc7930Address(
  encoded: string,
): { chainId: number; address: string } | null {
  const hex = encoded.replace("0x", "").toLowerCase();
  const bytes = hex.match(/.{2}/g)?.map((b) => parseInt(b, 16));
  if (!bytes || bytes.length < 23) return null; // minimum: 1 + 1 + 1 + 20

  if (bytes[0] !== 0x80) return null;

  const [chainId, consumed] = uleb128ToChainId(bytes.slice(1));
  const addrTypeIdx = 1 + consumed;

  if (bytes[addrTypeIdx] !== 0x01) return null; // only 20-byte addresses

  const addrBytes = bytes.slice(addrTypeIdx + 1, addrTypeIdx + 21);
  if (addrBytes.length !== 20) return null;

  const address =
    "0x" + addrBytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return { chainId, address };
}

/**
 * Build an ENSIP-25 text record key for agent registration.
 *
 * Format per spec: `agent-registration[<erc7930>][<agentId>]`
 */
export function buildEnsip25Key(
  chainId: number,
  registryAddress: string,
  agentId: string,
): string {
  const erc7930 = encodeErc7930Address(chainId, registryAddress);
  return `agent-registration[${erc7930}][${agentId}]`;
}

/**
 * Parse an ENSIP-25 text record key back into its components.
 *
 * Supports both bracket format `[registry][agentId]` and
 * slash format `[registry]/agentId` for compatibility.
 *
 * Returns null if the key doesn't match the expected pattern.
 */
export function parseEnsip25Key(
  key: string,
): { chainId: number; registryAddress: string; agentId: string } | null {
  // Try bracket format: agent-registration[erc7930][agentId]
  const bracketMatch = key.match(
    /^agent-registration\[([a-f0-9]+)\]\[(\w+)\]$/i,
  );
  // Try slash format: agent-registration[erc7930]/agentId
  const slashMatch = key.match(
    /^agent-registration\[([a-f0-9]+)\]\/(\w+)$/i,
  );

  const match = bracketMatch ?? slashMatch;
  if (!match) return null;

  const decoded = decodeErc7930Address(match[1]);
  if (!decoded) return null;

  return {
    chainId: decoded.chainId,
    registryAddress: decoded.address,
    agentId: match[2],
  };
}

/** Well-known ERC-8004 Identity Registry addresses */
export const KNOWN_REGISTRIES = {
  /** Base mainnet + ETH mainnet */
  base: {
    chainId: 8453,
    address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
  },
  /** Ethereum mainnet */
  ethereum: {
    chainId: 1,
    address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
  },
} as const;
