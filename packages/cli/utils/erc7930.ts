/**
 * ERC-7930 Address Encoding Utilities
 *
 * Encodes chain ID + contract address into ERC-7930 format for ENSIP-25 text record keys.
 * Reference: https://eips.ethereum.org/EIPS/eip-7930
 */

/**
 * Encode a chain ID as minimal ULEB128 bytes
 */
export function chainIdToMinimalBytes(chainId: number): number[] {
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
 * Build an ERC-7930 encoded address from chain ID and contract address
 * Format: 0x80 + ULEB128(chainId) + 0x01 (addr type) + 20-byte address
 */
export function buildErc7930Address(
	chainId: number,
	contractAddress: string,
): string {
	const chainBytes = chainIdToMinimalBytes(chainId);
	const addrBytes = contractAddress
		.replace("0x", "")
		.toLowerCase()
		.match(/.{2}/g)!
		.map((b) => parseInt(b, 16));
	const payload = [0x80, ...chainBytes, 0x01, ...addrBytes];
	return payload.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build an ENSIP-25 text record key for agent registration
 * Format: agent-registration[erc7930addr]/agentId
 */
export function buildEnsip25Key(
	chainId: number,
	registryAddress: string,
	agentId: string,
): string {
	const erc7930 = buildErc7930Address(chainId, registryAddress);
	return `agent-registration[${erc7930}]/${agentId}`;
}
