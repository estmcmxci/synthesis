/**
 * Utility Commands
 *
 * Namehash, labelhash, resolver lookup, and deployments display.
 * Uses ENSNode for faster lookups with on-chain fallback.
 */

import colors from "yoctocolors";
import { namehash, keccak256, toBytes } from "viem";
import { normalize } from "viem/ens";
import {
	startSpinner,
	stopSpinner,
	normalizeEnsName,
	getResolver,
	getDomainByName,
	getNetworkConfig,
	ENS_DEPLOYMENTS,
} from "../utils";

/**
 * Get namehash for an ENS name
 */
export async function getNamehash(options: {
	name: string;
	network?: string;
}) {
	const { name, network } = options;

	try {
		if (name.includes(".")) {
			// Full name - use standard namehash
			const hash = namehash(name);
			console.log(hash);
		} else {
			// Just a label - calculate ENS node
			const { fullName, node } = normalizeEnsName(name, network);
			console.log(colors.blue(`ENS node for ${fullName}:`));
			console.log(node);
		}
	} catch (error) {
		const e = error as Error;
		console.error(
			colors.red(`Error calculating namehash: ${e.message}`),
		);
	}
}

/**
 * Get labelhash for a label
 */
export async function getLabelHash(options: { name: string }) {
	const { name } = options;

	try {
		const label = name.split(".")[0];
		const normalizedLabel = normalize(label);
		const hash = keccak256(toBytes(normalizedLabel));
		console.log(hash);
	} catch (error) {
		const e = error as Error;
		console.error(
			colors.red(`Error calculating labelhash: ${e.message}`),
		);
	}
}

/**
 * Get resolver address for an ENS name
 * Uses ENSNode for faster lookup with on-chain fallback
 */
export async function getResolverAddress(options: {
	name: string;
	network?: string;
}) {
	startSpinner("Fetching resolver...");

	const { name, network } = options;

	try {
		const { fullName, node } = normalizeEnsName(name, network);
		let resolver: string | null = null;

		// Try ENSNode first for faster lookup
		try {
			const ensNodeData = await getDomainByName(
				fullName,
				network,
			);
			if (ensNodeData?.resolver?.address) {
				resolver = ensNodeData.resolver.address;
				stopSpinner();
				console.log(resolver);
				console.log(colors.gray("  (from ENSNode)"));
				return;
			}
		} catch {
			// ENSNode not available, fall back to on-chain
		}

		// Fall back to on-chain query
		resolver = await getResolver(node, network);

		stopSpinner();

		if (resolver) {
			console.log(resolver);
		} else {
			console.log(
				colors.yellow(`No resolver found for ${fullName}`),
			);
		}
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		console.error(
			colors.red(`Error getting resolver: ${e.message}`),
		);
	}
}

/**
 * Display contract deployments
 */
export function getDeployments() {
	console.log(colors.blue("\nENS Contract Deployments"));
	console.log(colors.blue("========================\n"));

	for (const [network, config] of Object.entries(ENS_DEPLOYMENTS)) {
		console.log(
			colors.green(
				`${network.toUpperCase()} (Chain ID: ${config.chainId})`,
			),
		);
		console.log(
			colors.blue(`  Parent Domain: ${config.parentDomain}`),
		);
		console.log(`  Registry:              ${config.registry}`);
		console.log(`  Resolver:              ${config.resolver}`);
		console.log(
			`  RegistrarController:   ${config.registrarController}`,
		);
		console.log(`  BaseRegistrar:         ${config.baseRegistrar}`);
		console.log(`  NameWrapper:           ${config.nameWrapper}`);
		console.log(
			`  ReverseRegistrar:      ${config.reverseRegistrar}`,
		);
		console.log(
			`  UniversalResolver:     ${config.universalResolver}`,
		);
		console.log(
			colors.gray(
				`  ENSNode:               ${config.ensNodeSubgraph}`,
			),
		);
		console.log(
			colors.gray(`  RPC:                   ${config.rpcUrl}`),
		);
		console.log(
			colors.gray(
				`  Explorer:              ${config.explorerUrl}`,
			),
		);
		console.log();
	}
}
