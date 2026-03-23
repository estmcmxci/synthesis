/**
 * Contract ABIs and Direct Contract Call Utilities
 *
 * For write operations and real-time reads, we use direct contract calls.
 * ENSNode is used for indexed read operations (profile, list, etc.)
 *
 * Key difference from basenames-cli: ENS uses a commit-reveal registration
 * process with different ABI signatures and struct layouts.
 */

import type { Address } from "viem";
import { encodeFunctionData, keccak256, encodePacked, namehash } from "viem";
import { normalize } from "viem/ens";
import { getNetworkConfig, type AgentChainConfig } from "../config/deployments";
import { getPublicClient, getWalletClient, createChainPublicClient } from "./viem";
import { mainnet, sepolia } from "viem/chains";

// ============================================================================
// ABI Definitions
// ============================================================================

export const REGISTRY_ABI = [
	{
		name: "resolver",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ type: "address" }],
	},
	{
		name: "owner",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ type: "address" }],
	},
	{
		name: "setSubnodeRecord",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "parentNode", type: "bytes32" },
			{ name: "labelHash", type: "bytes32" },
			{ name: "owner", type: "address" },
			{ name: "resolver", type: "address" },
			{ name: "ttl", type: "uint64" },
		],
		outputs: [],
	},
	{
		name: "setOwner",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "node", type: "bytes32" },
			{ name: "owner", type: "address" },
		],
		outputs: [],
	},
] as const;

export const RESOLVER_ABI = [
	{
		name: "addr",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ type: "address" }],
	},
	{
		name: "text",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "node", type: "bytes32" },
			{ name: "key", type: "string" },
		],
		outputs: [{ type: "string" }],
	},
	{
		name: "name",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ type: "string" }],
	},
	{
		name: "setAddr",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "node", type: "bytes32" },
			{ name: "addr", type: "address" },
		],
		outputs: [],
	},
	{
		name: "setText",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "node", type: "bytes32" },
			{ name: "key", type: "string" },
			{ name: "value", type: "string" },
		],
		outputs: [],
	},
	{
		name: "multicall",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "data", type: "bytes[]" }],
		outputs: [{ name: "results", type: "bytes[]" }],
	},
	// Overloaded addr with coin type (for compatibility)
	{
		name: "addr",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "node", type: "bytes32" },
			{ name: "coinType", type: "uint256" },
		],
		outputs: [{ type: "bytes" }],
	},
	{
		name: "contenthash",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ type: "bytes" }],
	},
	{
		name: "setContenthash",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "node", type: "bytes32" },
			{ name: "hash", type: "bytes" },
		],
		outputs: [],
	},
] as const;

/**
 * Shared read-only functions common to all ETHRegistrarController versions.
 */
const REGISTRAR_CONTROLLER_COMMON_ABI = [
	{
		name: "available",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "name", type: "string" }],
		outputs: [{ type: "bool" }],
	},
	{
		name: "rentPrice",
		type: "function",
		stateMutability: "view",
		inputs: [
			{ name: "name", type: "string" },
			{ name: "duration", type: "uint256" },
		],
		outputs: [
			{
				name: "price",
				type: "tuple",
				components: [
					{ name: "base", type: "uint256" },
					{ name: "premium", type: "uint256" },
				],
			},
		],
	},
	{
		name: "commit",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "commitment", type: "bytes32" }],
		outputs: [],
	},
	{
		name: "minCommitmentAge",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ type: "uint256" }],
	},
	{
		name: "maxCommitmentAge",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [{ type: "uint256" }],
	},
] as const;

/**
 * ENS v3 ETHRegistrarController ABI (Mainnet)
 *
 * Uses individual args for makeCommitment/register with bool reverseRecord
 * and uint16 ownerControlledFuses.
 */
export const REGISTRAR_CONTROLLER_ABI_V3 = [
	...REGISTRAR_CONTROLLER_COMMON_ABI,
	{
		name: "makeCommitment",
		type: "function",
		stateMutability: "pure",
		inputs: [
			{ name: "name", type: "string" },
			{ name: "owner", type: "address" },
			{ name: "duration", type: "uint256" },
			{ name: "secret", type: "bytes32" },
			{ name: "resolver", type: "address" },
			{ name: "data", type: "bytes[]" },
			{ name: "reverseRecord", type: "bool" },
			{ name: "ownerControlledFuses", type: "uint16" },
		],
		outputs: [{ type: "bytes32" }],
	},
	{
		name: "register",
		type: "function",
		stateMutability: "payable",
		inputs: [
			{ name: "name", type: "string" },
			{ name: "owner", type: "address" },
			{ name: "duration", type: "uint256" },
			{ name: "secret", type: "bytes32" },
			{ name: "resolver", type: "address" },
			{ name: "data", type: "bytes[]" },
			{ name: "reverseRecord", type: "bool" },
			{ name: "ownerControlledFuses", type: "uint16" },
		],
		outputs: [],
	},
	{
		name: "renew",
		type: "function",
		stateMutability: "payable",
		inputs: [
			{ name: "name", type: "string" },
			{ name: "duration", type: "uint256" },
		],
		outputs: [],
	},
] as const;

/**
 * Registration tuple type used by the struct-based ABI entries.
 */
const REGISTRATION_TUPLE = {
	name: "registration",
	type: "tuple",
	components: [
		{ name: "label", type: "string" },
		{ name: "owner", type: "address" },
		{ name: "duration", type: "uint256" },
		{ name: "secret", type: "bytes32" },
		{ name: "resolver", type: "address" },
		{ name: "data", type: "bytes[]" },
		{ name: "reverseRecord", type: "uint8" },
		{ name: "referrer", type: "bytes32" },
	],
} as const;

/**
 * ENS v4 ETHRegistrarController ABI (Sepolia / newer deployments)
 *
 * Uses a Registration struct for makeCommitment/register with uint8 reverseRecord
 * and bytes32 referrer. renew also takes a bytes32 referrer.
 */
export const REGISTRAR_CONTROLLER_ABI_V4 = [
	...REGISTRAR_CONTROLLER_COMMON_ABI,
	{
		name: "makeCommitment",
		type: "function",
		stateMutability: "pure",
		inputs: [REGISTRATION_TUPLE],
		outputs: [{ type: "bytes32" }],
	},
	{
		name: "register",
		type: "function",
		stateMutability: "payable",
		inputs: [REGISTRATION_TUPLE],
		outputs: [],
	},
	{
		name: "renew",
		type: "function",
		stateMutability: "payable",
		inputs: [
			{ name: "label", type: "string" },
			{ name: "duration", type: "uint256" },
			{ name: "referrer", type: "bytes32" },
		],
		outputs: [],
	},
] as const;

/**
 * Get the correct registrar controller ABI for the network.
 * Mainnet uses v3 (individual args), Sepolia uses v4 (struct-based).
 */
export function getRegistrarControllerAbi(network?: string) {
	const config = getNetworkConfig(network);
	return config.chainId === 1
		? REGISTRAR_CONTROLLER_ABI_V3
		: REGISTRAR_CONTROLLER_ABI_V4;
}

/** Alias for backward compat in read-only callers (available, rentPrice, etc.) */
export const REGISTRAR_CONTROLLER_ABI = REGISTRAR_CONTROLLER_COMMON_ABI;

export const REVERSE_REGISTRAR_ABI = [
	{
		name: "node",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "addr", type: "address" }],
		outputs: [{ type: "bytes32" }],
	},
	{
		name: "setName",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "name", type: "string" }],
		outputs: [{ type: "bytes32" }],
	},
	// L1-style setNameForAddr (4 params)
	{
		name: "setNameForAddr",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "addr", type: "address" },
			{ name: "owner", type: "address" },
			{ name: "resolver", type: "address" },
			{ name: "name", type: "string" },
		],
		outputs: [{ type: "bytes32" }],
	},
] as const;

export const BASE_REGISTRAR_ABI = [
	{
		name: "safeTransferFrom",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "to", type: "address" },
			{ name: "tokenId", type: "uint256" },
		],
		outputs: [],
	},
	{
		name: "ownerOf",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "tokenId", type: "uint256" }],
		outputs: [{ type: "address" }],
	},
] as const;

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Check if an ENS name is available for registration
 */
export async function checkAvailable(
	label: string,
	network?: string,
): Promise<boolean> {
	const config = getNetworkConfig(network);
	const client = getPublicClient(network);

	const normalizedName = normalize(label);

	try {
		const isAvailable = await client.readContract({
			address: config.registrarController,
			abi: REGISTRAR_CONTROLLER_ABI,
			functionName: "available",
			args: [normalizedName],
		});

		return isAvailable as boolean;
	} catch (error) {
		const e = error as Error;
		if (e.message.includes("returned no data")) {
			throw new Error(
				`Contract call failed: The "available" function on ${config.registrarController} returned no data. ` +
					`This might indicate: (1) RPC connection issue, (2) Contract address incorrect, or (3) Function signature mismatch. ` +
					`Network: ${network || "sepolia (default)"}, Label: "${label}", Normalized: "${normalizedName}"`,
			);
		}
		throw new Error(
			`Failed to check availability for "${label}" (normalized: "${normalizedName}") on ${config.registrarController}: ${e.message}`,
		);
	}
}

/**
 * Get rent price for an ENS name
 * Returns { base, premium } unlike Basenames which returns a single uint256
 */
export async function getRentPrice(
	label: string,
	durationSeconds: bigint,
	network?: string,
): Promise<{ base: bigint; premium: bigint }> {
	const config = getNetworkConfig(network);
	const client = getPublicClient(network);

	const normalizedName = normalize(label);

	const price = (await client.readContract({
		address: config.registrarController,
		abi: REGISTRAR_CONTROLLER_ABI,
		functionName: "rentPrice",
		args: [normalizedName, durationSeconds],
	})) as { base: bigint; premium: bigint };

	return price;
}

/**
 * Get the minimum commitment age (wait time between commit and register)
 */
export async function getMinCommitmentAge(
	network?: string,
): Promise<bigint> {
	const config = getNetworkConfig(network);
	const client = getPublicClient(network);

	const age = await client.readContract({
		address: config.registrarController,
		abi: REGISTRAR_CONTROLLER_ABI,
		functionName: "minCommitmentAge",
	});

	return age as bigint;
}

/**
 * Get resolver address for an ENS name
 */
export async function getResolver(
	node: `0x${string}`,
	network?: string,
): Promise<Address | null> {
	const config = getNetworkConfig(network);
	const client = getPublicClient(network);

	try {
		const resolver = await client.readContract({
			address: config.registry,
			abi: REGISTRY_ABI,
			functionName: "resolver",
			args: [node],
		});

		if (resolver === "0x0000000000000000000000000000000000000000") {
			return null;
		}
		return resolver as Address;
	} catch (error) {
		const e = error as Error;
		if (
			e.message.includes("timeout") ||
			e.message.includes("network") ||
			e.message.includes("ECONNREFUSED") ||
			e.message.includes("fetch failed")
		) {
			throw new Error(
				`RPC error: ${e.message}. Check your network connection.`,
			);
		}
		console.error(`getResolver error for node ${node}: ${e.message}`);
		return null;
	}
}

/**
 * Get owner address for an ENS name
 */
export async function getOwner(
	node: `0x${string}`,
	network?: string,
): Promise<Address | null> {
	const config = getNetworkConfig(network);
	const client = getPublicClient(network);

	try {
		const owner = await client.readContract({
			address: config.registry,
			abi: REGISTRY_ABI,
			functionName: "owner",
			args: [node],
		});

		if (owner === "0x0000000000000000000000000000000000000000") {
			return null;
		}
		return owner as Address;
	} catch {
		return null;
	}
}

/**
 * Get address record from resolver
 * Simplified for L1 - only checks the default ETH address slot (coin type 60)
 */
export async function getAddressRecord(
	resolverAddress: Address,
	node: `0x${string}`,
	network?: string,
): Promise<Address | null> {
	const client = getPublicClient(network);

	try {
		const addr = await client.readContract({
			address: resolverAddress,
			abi: RESOLVER_ABI,
			functionName: "addr",
			args: [node],
		});

		if (addr && addr !== "0x0000000000000000000000000000000000000000") {
			return addr as Address;
		}
	} catch {
		// No address record
	}

	return null;
}

/**
 * Get text record from resolver
 */
export async function getTextRecord(
	resolverAddress: Address,
	node: `0x${string}`,
	key: string,
	network?: string,
): Promise<string | null> {
	const client = getPublicClient(network);

	try {
		const value = await client.readContract({
			address: resolverAddress,
			abi: RESOLVER_ABI,
			functionName: "text",
			args: [node, key],
		});

		return value || null;
	} catch {
		return null;
	}
}

/**
 * Get contenthash from resolver
 */
export async function getContenthash(
	resolverAddress: Address,
	node: `0x${string}`,
	network?: string,
): Promise<`0x${string}` | null> {
	const client = getPublicClient(network);

	try {
		const value = await client.readContract({
			address: resolverAddress,
			abi: RESOLVER_ABI,
			functionName: "contenthash",
			args: [node],
		});

		if (
			!value ||
			value === "0x" ||
			value === "0x0000000000000000000000000000000000000000"
		) {
			return null;
		}
		return value as `0x${string}`;
	} catch {
		return null;
	}
}

/**
 * Encode an IPFS CID (base32/base58) into ENS contenthash bytes.
 *
 * Contenthash format for IPFS: 0xe3010170 + CID multihash
 * - 0xe3 = IPFS namespace (varint)
 * - 0x01 = CIDv1
 * - 0x70 = dag-pb codec (or 0x55 for raw)
 * - followed by the multihash
 */
export function encodeIpfsContenthash(cid: string): `0x${string}` {
	// Base32 CIDv1 (bafybei... or bafkrei...)
	// We need to decode the CID and extract the raw bytes
	// CIDv1 base32lower: decode base32 -> version(1) + codec + multihash

	// Simple approach: use the base32 alphabet to decode
	const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
	const stripped = cid.replace("bafybei", "").replace("bafkrei", "");

	// Determine codec from CID prefix
	// bafybei = CIDv1 + dag-pb (0x70)
	// bafkrei = CIDv1 + raw (0x55)
	const isDagPb = cid.startsWith("bafybei");

	// Full base32 decode of the CID (without the multibase prefix 'b')
	const base32Str = cid.slice(1); // remove 'b' multibase prefix
	const bits: number[] = [];
	for (const char of base32Str) {
		const val = alphabet.indexOf(char);
		if (val === -1) continue;
		for (let i = 4; i >= 0; i--) {
			bits.push((val >> i) & 1);
		}
	}

	const bytes: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) {
		let byte = 0;
		for (let j = 0; j < 8; j++) {
			byte = (byte << 1) | bits[i + j];
		}
		bytes.push(byte);
	}

	// bytes[0] = CID version (0x01)
	// bytes[1] = codec (0x70 for dag-pb, 0x55 for raw)
	// bytes[2..] = multihash

	// Contenthash = 0xe301 + full CID bytes (version + codec + multihash)
	const contenthash = [0xe3, 0x01, ...bytes];
	return ("0x" + contenthash.map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

/**
 * Set contenthash on an ENS name's resolver
 */
export async function setContenthashOnChain(
	name: string,
	contenthash: `0x${string}`,
	resolverAddress: Address,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<`0x${string}`> {
	const wallet = await getWalletClient(network, useLedger, accountIndex);
	const client = getPublicClient(network);

	if (!wallet || !wallet.account) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	const chain = network === "mainnet" || network === undefined ? mainnet : sepolia;
	const node = namehash(normalize(name));

	const txHash = await wallet.writeContract({
		chain,
		account: wallet.account,
		address: resolverAddress,
		abi: RESOLVER_ABI,
		functionName: "setContenthash",
		args: [node, contenthash],
	});

	await client.waitForTransactionReceipt({
		hash: txHash,
		confirmations: 2,
	});

	return txHash;
}

/**
 * Get primary name (reverse resolution) for an address
 */
export async function getPrimaryNameOnChain(
	address: Address,
	network?: string,
): Promise<string | null> {
	const config = getNetworkConfig(network);
	const client = getPublicClient(network);

	try {
		// Get reverse node for address
		const reverseNode = await client.readContract({
			address: config.reverseRegistrar,
			abi: REVERSE_REGISTRAR_ABI,
			functionName: "node",
			args: [address],
		});

		if (
			reverseNode ===
			"0x0000000000000000000000000000000000000000000000000000000000000000"
		) {
			return null;
		}

		// Get name from resolver
		const name = await client.readContract({
			address: config.resolver,
			abi: RESOLVER_ABI,
			functionName: "name",
			args: [reverseNode as `0x${string}`],
		});

		return name || null;
	} catch {
		return null;
	}
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Register a new ENS name using commit-reveal process
 *
 * This is the key difference from Basenames:
 * 1. Generate random secret
 * 2. makeCommitment (pure/view call)
 * 3. commit(commitment) - tx
 * 4. Wait minCommitmentAge + buffer
 * 5. register(request) - tx with value
 *
 * Returns { commitTxHash, registerTxHash }
 */
export async function registerEnsName(
	label: string,
	owner: Address,
	durationSeconds: bigint,
	resolverData: `0x${string}`[],
	reverseRecord: boolean,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
	onCommitSent?: (txHash: `0x${string}`) => void,
	onCommitConfirmed?: () => void,
	onWaitStart?: (waitSeconds: number) => void,
	onWaitTick?: (remainingSeconds: number) => void,
	onRegisterSent?: (txHash: `0x${string}`) => void,
): Promise<{ commitTxHash: `0x${string}`; registerTxHash: `0x${string}` }> {
	const config = getNetworkConfig(network);
	const client = getPublicClient(network);
	const wallet = await getWalletClient(network, useLedger, accountIndex);

	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const chain = config.chainId === 1 ? mainnet : sepolia;
	const isV4 = config.chainId !== 1;
	const abi = getRegistrarControllerAbi(network);
	const normalizedName = normalize(label);

	// Step 1: Generate random secret
	const secretBytes = new Uint8Array(32);
	crypto.getRandomValues(secretBytes);
	const secret = `0x${Array.from(secretBytes).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;

	// Step 2: Get rent price
	const price = await getRentPrice(normalizedName, durationSeconds, network);
	const totalPrice = price.base + price.premium;
	// Add 10% buffer (excess is refunded)
	const value = totalPrice + totalPrice / 10n;

	// Step 3: Make commitment
	// V4 (Sepolia) uses a Registration struct; V3 (mainnet) uses individual args
	let commitment: `0x${string}`;
	if (isV4) {
		const registration = {
			label: normalizedName,
			owner,
			duration: durationSeconds,
			secret,
			resolver: config.resolver,
			data: resolverData,
			reverseRecord: reverseRecord ? 1 : 0,
			referrer: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
		};
		commitment = (await client.readContract({
			address: config.registrarController,
			abi: REGISTRAR_CONTROLLER_ABI_V4,
			functionName: "makeCommitment",
			args: [registration],
		})) as `0x${string}`;
	} else {
		commitment = (await client.readContract({
			address: config.registrarController,
			abi: REGISTRAR_CONTROLLER_ABI_V3,
			functionName: "makeCommitment",
			args: [normalizedName, owner, durationSeconds, secret, config.resolver, resolverData, reverseRecord, 0],
		})) as `0x${string}`;
	}

	// Step 4: Submit commit transaction
	const commitTxHash = await wallet.writeContract({
		chain,
		account: wallet.account,
		address: config.registrarController,
		abi,
		functionName: "commit",
		args: [commitment],
	});

	onCommitSent?.(commitTxHash);

	// Wait for commit confirmation
	await client.waitForTransactionReceipt({
		hash: commitTxHash,
		confirmations: 2,
	});

	onCommitConfirmed?.();

	// Step 5: Wait for minCommitmentAge + buffer
	const minAge = await getMinCommitmentAge(network);
	const waitSeconds = Number(minAge) + 5; // 5 second buffer

	onWaitStart?.(waitSeconds);

	// Countdown wait
	for (let remaining = waitSeconds; remaining > 0; remaining--) {
		onWaitTick?.(remaining);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	// Step 6: Submit register transaction
	let registerTxHash: `0x${string}`;
	if (isV4) {
		const registration = {
			label: normalizedName,
			owner,
			duration: durationSeconds,
			secret,
			resolver: config.resolver,
			data: resolverData,
			reverseRecord: reverseRecord ? 1 : 0,
			referrer: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
		};
		registerTxHash = await wallet.writeContract({
			chain,
			account: wallet.account,
			address: config.registrarController,
			abi: REGISTRAR_CONTROLLER_ABI_V4,
			functionName: "register",
			args: [registration],
			value,
		});
	} else {
		registerTxHash = await wallet.writeContract({
			chain,
			account: wallet.account,
			address: config.registrarController,
			abi: REGISTRAR_CONTROLLER_ABI_V3,
			functionName: "register",
			args: [normalizedName, owner, durationSeconds, secret, config.resolver, resolverData, reverseRecord, 0],
			value,
		});
	}

	onRegisterSent?.(registerTxHash);

	return { commitTxHash, registerTxHash };
}

/**
 * Set a text record
 */
export async function setTextRecordOnChain(
	node: `0x${string}`,
	key: string,
	value: string,
	resolverAddress?: Address,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<`0x${string}`> {
	const config = getNetworkConfig(network);
	const wallet = await getWalletClient(network, useLedger, accountIndex);

	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const chain = config.chainId === 1 ? mainnet : sepolia;
	const resolver = resolverAddress || config.resolver;

	const txHash = await wallet.writeContract({
		chain,
		account: wallet.account,
		address: resolver,
		abi: RESOLVER_ABI,
		functionName: "setText",
		args: [node, key, value],
	});

	return txHash;
}

/**
 * Set address record (standard ETH coin type 60)
 */
export async function setAddressRecordOnChain(
	node: `0x${string}`,
	address: Address,
	resolverAddress?: Address,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<`0x${string}`> {
	const config = getNetworkConfig(network);
	const wallet = await getWalletClient(network, useLedger, accountIndex);

	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const chain = config.chainId === 1 ? mainnet : sepolia;
	const resolver = resolverAddress || config.resolver;

	const txHash = await wallet.writeContract({
		chain,
		account: wallet.account,
		address: resolver,
		abi: RESOLVER_ABI,
		functionName: "setAddr",
		args: [node, address],
	});

	return txHash;
}

/**
 * Set primary name (reverse record)
 * Uses L1-style setNameForAddr(addr, owner, resolver, name)
 */
export async function setPrimaryNameOnChain(
	name: string,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<`0x${string}`> {
	const config = getNetworkConfig(network);
	const wallet = await getWalletClient(network, useLedger, accountIndex);

	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const chain = config.chainId === 1 ? mainnet : sepolia;
	const signerAddress = wallet.account.address;

	const txHash = await wallet.writeContract({
		chain,
		account: wallet.account,
		address: config.reverseRegistrar,
		abi: REVERSE_REGISTRAR_ABI,
		functionName: "setNameForAddr",
		args: [signerAddress, signerAddress, config.resolver, name],
	});

	return txHash;
}

/**
 * Renew an ENS name
 */
export async function renewEnsName(
	label: string,
	durationSeconds: bigint,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<`0x${string}`> {
	const config = getNetworkConfig(network);
	const wallet = await getWalletClient(network, useLedger, accountIndex);

	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const chain = config.chainId === 1 ? mainnet : sepolia;
	const isV4 = config.chainId !== 1;
	const normalizedName = normalize(label);

	// Get rent price and add 10% buffer (excess is refunded)
	const price = await getRentPrice(normalizedName, durationSeconds, network);
	const totalPrice = price.base + price.premium;
	const value = totalPrice + totalPrice / 10n;

	let txHash: `0x${string}`;
	if (isV4) {
		// V4 renew has an extra referrer param
		txHash = await wallet.writeContract({
			chain,
			account: wallet.account,
			address: config.registrarController,
			abi: REGISTRAR_CONTROLLER_ABI_V4,
			functionName: "renew",
			args: [normalizedName, durationSeconds, "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`],
			value,
		});
	} else {
		txHash = await wallet.writeContract({
			chain,
			account: wallet.account,
			address: config.registrarController,
			abi: REGISTRAR_CONTROLLER_ABI_V3,
			functionName: "renew",
			args: [normalizedName, durationSeconds],
			value,
		});
	}

	return txHash;
}

/**
 * Transfer an ENS .eth name (ERC-721 transfer on BaseRegistrar)
 */
export async function transferEnsName(
	label: string,
	to: Address,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<`0x${string}`> {
	const config = getNetworkConfig(network);
	const client = getPublicClient(network);
	const wallet = await getWalletClient(network, useLedger, accountIndex);

	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const chain = config.chainId === 1 ? mainnet : sepolia;

	// Compute tokenId = uint256(keccak256(label))
	const tokenId = BigInt(
		keccak256(encodePacked(["string"], [label])),
	);

	// Pre-flight: verify signer owns the token
	const currentOwner = (await client.readContract({
		address: config.baseRegistrar,
		abi: BASE_REGISTRAR_ABI,
		functionName: "ownerOf",
		args: [tokenId],
	})) as Address;

	const signerAddress = wallet.account.address;
	if (currentOwner.toLowerCase() !== signerAddress.toLowerCase()) {
		throw new Error(
			`Token not owned by signer. Owner: ${currentOwner}, Signer: ${signerAddress}`,
		);
	}

	const txHash = await wallet.writeContract({
		chain,
		account: wallet.account,
		address: config.baseRegistrar,
		abi: BASE_REGISTRAR_ABI,
		functionName: "safeTransferFrom",
		args: [signerAddress, to, tokenId],
	});

	return txHash;
}

/**
 * Build resolver data for setting records during registration
 */
export function buildResolverData(
	node: `0x${string}`,
	addressToSet?: Address,
	textRecords?: Record<string, string>,
): `0x${string}`[] {
	const data: `0x${string}`[] = [];

	// Add setAddr call
	if (addressToSet) {
		data.push(
			encodeFunctionData({
				abi: RESOLVER_ABI,
				functionName: "setAddr",
				args: [node, addressToSet],
			}),
		);
	}

	// Add setText calls
	if (textRecords) {
		for (const [key, value] of Object.entries(textRecords)) {
			data.push(
				encodeFunctionData({
					abi: RESOLVER_ABI,
					functionName: "setText",
					args: [node, key, value],
				}),
			);
		}
	}

	return data;
}

// ============================================================================
// Name Contract Utilities (for naming smart contracts)
// ============================================================================

/**
 * Check if the signer owns the parent domain
 */
export async function checkParentOwnership(
	parentNode: `0x${string}`,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<boolean> {
	const wallet = await getWalletClient(network, useLedger, accountIndex);
	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const signerAddress = wallet.account.address;
	const ownerAddress = await getOwner(parentNode, network);

	return ownerAddress?.toLowerCase() === signerAddress.toLowerCase();
}

/**
 * Get resolver from parent node with fallback to public resolver (ENSIP-10)
 */
export async function getResolverFromParent(
	parentNode: `0x${string}`,
	network?: string,
): Promise<Address> {
	const config = getNetworkConfig(network);
	const parentResolver = await getResolver(parentNode, network);

	return parentResolver || config.resolver;
}

/**
 * Create a subname under a parent domain
 */
export async function createSubname(
	parentNode: `0x${string}`,
	labelHashValue: `0x${string}`,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<`0x${string}` | null> {
	const config = getNetworkConfig(network);
	const wallet = await getWalletClient(network, useLedger, accountIndex);
	const client = getPublicClient(network);

	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const chain = config.chainId === 1 ? mainnet : sepolia;
	const signerAddress = wallet.account.address;

	// Calculate subname node
	const subnameNode = keccak256(
		encodePacked(["bytes32", "bytes32"], [parentNode, labelHashValue]),
	) as `0x${string}`;

	// Check if subname already exists
	const existingOwner = await getOwner(subnameNode, network);

	// If exists and owned by signer, skip (idempotent)
	if (
		existingOwner &&
		existingOwner.toLowerCase() === signerAddress.toLowerCase()
	) {
		return null;
	}

	// If exists and owned by different address, throw error
	if (
		existingOwner &&
		existingOwner !== "0x0000000000000000000000000000000000000000"
	) {
		throw new Error(
			`Subname already exists and is owned by ${existingOwner}. ` +
				`You cannot overwrite a subname owned by another address.`,
		);
	}

	// Get resolver from parent (ENSIP-10)
	const resolver = await getResolverFromParent(parentNode, network);

	// Create subname via Registry
	const txHash = await wallet.writeContract({
		chain,
		account: wallet.account,
		address: config.registry,
		abi: REGISTRY_ABI,
		functionName: "setSubnodeRecord",
		args: [parentNode, labelHashValue, signerAddress, resolver, 0n],
	});

	// Wait for confirmation
	await client.waitForTransactionReceipt({
		hash: txHash,
		confirmations: 2,
	});

	return txHash;
}

/**
 * Set reverse resolution for a contract using L1-style interface
 */
export async function setReverseResolution(
	contractAddress: Address,
	name: string,
	network?: string,
	useLedger?: boolean,
	accountIndex?: number,
): Promise<`0x${string}` | null> {
	const config = getNetworkConfig(network);
	const wallet = await getWalletClient(network, useLedger, accountIndex);
	const client = getPublicClient(network);

	if (!wallet) {
		throw new Error(
			"Wallet not configured. Set ENS_PRIVATE_KEY environment variable or use --ledger flag.",
		);
	}

	if (!wallet.account) {
		throw new Error("Wallet account not available.");
	}

	const chain = config.chainId === 1 ? mainnet : sepolia;

	// Get the contract's owner (required for authorization)
	const ownerAddress = (await client.readContract({
		address: contractAddress,
		abi: [
			{
				name: "owner",
				type: "function",
				stateMutability: "view",
				inputs: [],
				outputs: [{ type: "address" }],
			},
		],
		functionName: "owner",
	})) as Address;

	// Use L1-style setNameForAddr with 4 params (addr, owner, resolver, name)
	const txHash = await wallet.writeContract({
		chain,
		account: wallet.account,
		address: config.reverseRegistrar,
		abi: REVERSE_REGISTRAR_ABI,
		functionName: "setNameForAddr",
		args: [contractAddress, ownerAddress, config.resolver, name],
	});

	// Wait for confirmation
	await client.waitForTransactionReceipt({
		hash: txHash,
		confirmations: 2,
	});

	return txHash;
}

/**
 * Calculate subname node from parent node and label hash
 */
export function calculateSubnameNode(
	parentNode: `0x${string}`,
	labelHashValue: `0x${string}`,
): `0x${string}` {
	return keccak256(
		encodePacked(["bytes32", "bytes32"], [parentNode, labelHashValue]),
	) as `0x${string}`;
}

// ============================================================================
// ERC-8004 Identity Registry ABI & Helpers
// ============================================================================

export const IDENTITY_REGISTRY_8004_ABI = [
	{
		name: "register",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "agentURI", type: "string" }],
		outputs: [{ type: "uint256" }],
	},
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
 * Read tokenURI from ERC-8004 Identity Registry
 */
export async function getAgentTokenURI(
	agentChain: AgentChainConfig,
	agentId: string,
): Promise<string> {
	const client = createChainPublicClient(agentChain.chainId, agentChain.rpcUrl);
	return (await client.readContract({
		address: agentChain.identityRegistry8004,
		abi: IDENTITY_REGISTRY_8004_ABI,
		functionName: "tokenURI",
		args: [BigInt(agentId)],
	})) as string;
}

/**
 * Read ownerOf from ERC-8004 Identity Registry
 */
export async function getAgentOwner(
	agentChain: AgentChainConfig,
	agentId: string,
): Promise<Address> {
	const client = createChainPublicClient(agentChain.chainId, agentChain.rpcUrl);
	return (await client.readContract({
		address: agentChain.identityRegistry8004,
		abi: IDENTITY_REGISTRY_8004_ABI,
		functionName: "ownerOf",
		args: [BigInt(agentId)],
	})) as Address;
}
