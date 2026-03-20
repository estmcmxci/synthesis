/**
 * Viem Client Setup for ENS CLI
 *
 * Configures public and wallet clients for Ethereum Mainnet, Sepolia,
 * and agent chains (Base, Optimism, Arbitrum) with ENSNode subgraph
 * integration for indexed queries.
 */

import {
	createPublicClient,
	createWalletClient,
	http,
	type Chain,
	type PublicClient,
	type WalletClient,
} from "viem";
import { mainnet, sepolia, base, optimism, arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getNetworkConfig } from "../config/deployments";
import { getLedgerAccount, getLedgerAddress, closeLedger } from "./ledger";

/**
 * Chain map for all supported chains
 */
const CHAIN_MAP: Record<number, Chain> = {
	1: mainnet,
	11155111: sepolia,
	8453: base,
	10: optimism,
	42161: arbitrum,
};

/**
 * Per-chain RPC environment variable overrides
 */
const RPC_ENV_KEYS: Record<number, string> = {
	1: "ETH_RPC_URL_MAINNET",
	11155111: "ETH_RPC_URL_SEPOLIA",
	8453: "RPC_URL_BASE",
	10: "RPC_URL_OP",
	42161: "RPC_URL_ARB",
};

/**
 * Resolve the RPC URL for a given chain ID and default URL
 */
function resolveRpcUrl(chainId: number, defaultUrl: string): string {
	const envKey = RPC_ENV_KEYS[chainId];
	return (envKey && process.env[envKey]) || process.env.ETH_RPC_URL || defaultUrl;
}

/**
 * Create a public client for read operations
 * Configured with ENSNode subgraph for indexed queries
 */
export function createEnsPublicClient(network?: string): PublicClient {
	const config = getNetworkConfig(network);
	const chain = CHAIN_MAP[config.chainId] || sepolia;
	const rpcUrl = resolveRpcUrl(config.chainId, config.rpcUrl);

	return createPublicClient({
		chain: {
			...chain,
			subgraphs: { ens: { url: config.ensNodeSubgraph } },
		} as any,
		transport: http(rpcUrl),
	}) as PublicClient;
}

/**
 * Create a public client for any chain by chain ID and RPC URL.
 * Used for agent-only chains (Base, OP, Arb) that aren't in ENS_DEPLOYMENTS.
 */
export function createChainPublicClient(
	chainId: number,
	defaultRpcUrl: string,
): PublicClient {
	const chain = CHAIN_MAP[chainId];
	if (!chain) {
		throw new Error(`Unsupported chain ID: ${chainId}`);
	}
	const rpcUrl = resolveRpcUrl(chainId, defaultRpcUrl);
	return createPublicClient({
		chain,
		transport: http(rpcUrl),
	}) as PublicClient;
}

/**
 * Create a wallet client for write operations
 * Supports both private key (env var) and Ledger hardware wallet
 */
export async function createEnsWalletClient(
	network?: string,
	useLedger = false,
	accountIndex = 0,
): Promise<WalletClient | null> {
	const config = getNetworkConfig(network);
	const chain = CHAIN_MAP[config.chainId] || sepolia;
	const rpcUrl = resolveRpcUrl(config.chainId, config.rpcUrl);

	if (useLedger) {
		const account = await getLedgerAccount(accountIndex);
		return createWalletClient({
			account,
			chain,
			transport: http(rpcUrl),
		});
	}

	const privateKey = process.env.ENS_PRIVATE_KEY;
	if (!privateKey) {
		return null;
	}

	const account = privateKeyToAccount(privateKey as `0x${string}`);
	return createWalletClient({
		account,
		chain,
		transport: http(rpcUrl),
	});
}

/**
 * Create a wallet client for any chain by chain ID and RPC URL.
 * Used for agent-only chains (Base, OP, Arb).
 */
export async function createChainWalletClient(
	chainId: number,
	defaultRpcUrl: string,
	useLedger = false,
	accountIndex = 0,
): Promise<WalletClient | null> {
	const chain = CHAIN_MAP[chainId];
	if (!chain) {
		throw new Error(`Unsupported chain ID: ${chainId}`);
	}
	const rpcUrl = resolveRpcUrl(chainId, defaultRpcUrl);

	if (useLedger) {
		const account = await getLedgerAccount(accountIndex);
		return createWalletClient({
			account,
			chain,
			transport: http(rpcUrl),
		});
	}

	const privateKey = process.env.ENS_PRIVATE_KEY;
	if (!privateKey) {
		return null;
	}

	const account = privateKeyToAccount(privateKey as `0x${string}`);
	return createWalletClient({
		account,
		chain,
		transport: http(rpcUrl),
	});
}

/**
 * Get the signer address from the configured private key
 */
export function getSignerAddress(): `0x${string}` | null {
	const privateKey = process.env.ENS_PRIVATE_KEY;
	if (!privateKey) return null;

	const account = privateKeyToAccount(privateKey as `0x${string}`);
	return account.address;
}

// Cache clients per network to avoid recreating them
const _publicClients: Map<string, PublicClient> = new Map();
const _walletClients: Map<string, WalletClient> = new Map();

export function getPublicClient(network?: string): PublicClient {
	const net = network || process.env.ENS_NETWORK || "sepolia";

	if (!_publicClients.has(net)) {
		_publicClients.set(net, createEnsPublicClient(net));
	}
	return _publicClients.get(net)!;
}

export async function getWalletClient(
	network?: string,
	useLedger = false,
	accountIndex = 0,
): Promise<WalletClient | null> {
	const net = network || process.env.ENS_NETWORK || "sepolia";

	// For Ledger, always create fresh client (no caching)
	if (useLedger) {
		return await createEnsWalletClient(net, true, accountIndex);
	}

	// For private key, use cached client
	if (!_walletClients.has(net)) {
		const client = await createEnsWalletClient(net);
		if (client) {
			_walletClients.set(net, client);
		} else {
			return null;
		}
	}
	return _walletClients.get(net) || null;
}

/**
 * Get signer address (async version for Ledger support)
 */
export async function getSignerAddressAsync(
	useLedger = false,
	accountIndex = 0,
): Promise<`0x${string}` | null> {
	if (useLedger) {
		return await getLedgerAddress(accountIndex);
	}
	return getSignerAddress();
}

// Re-export closeLedger for cleanup
export { closeLedger };
