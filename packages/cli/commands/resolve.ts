/**
 * Resolve Command
 *
 * Resolve an ENS name to an address or vice versa.
 * Uses ENSNode for fast indexed queries with on-chain fallback.
 */

import colors from "yoctocolors";
import { isAddress } from "viem";
import {
	startSpinner,
	stopSpinner,
	normalizeEnsName,
	getResolver,
	getAddressRecord,
	getTextRecord,
	getContenthash,
	getPrimaryNameOnChain,
	getDomainByName,
	getNetworkConfig,
	resolveAvatarUri,
	type ResolveOptions,
} from "../utils";

/**
 * Decode contenthash bytes into a human-readable URI.
 * Supports IPFS (e3010170), IPNS (e5010172), and Swarm (e4) codec prefixes.
 * Falls back to raw hex for unknown codecs.
 */
function decodeContenthash(hex: `0x${string}`): string {
	const data = hex.slice(2); // strip 0x

	// IPFS: starts with e3010170
	if (data.startsWith("e3010170")) {
		const cidBytes = data.slice(8);
		return `ipfs://${hexToBase16CID("f01701220" + cidBytes.slice(4))}`;
	}

	// IPNS: starts with e5010172
	if (data.startsWith("e5010172")) {
		const cidBytes = data.slice(8);
		return `ipns://${hexToBase16CID("f01721220" + cidBytes.slice(4))}`;
	}

	// Swarm: starts with e40101fa011b20
	if (data.startsWith("e4")) {
		// Extract the hash after the swarm prefix bytes
		const hashStart = data.indexOf("1b20");
		if (hashStart !== -1) {
			const hash = data.slice(hashStart + 4);
			return `bzz://${hash}`;
		}
		return `bzz://${data.slice(2)}`;
	}

	return hex;
}

/**
 * Convert hex string to a base16 CID string (CIDv1 with f prefix).
 * This produces a valid CID that can be used with IPFS gateways.
 */
function hexToBase16CID(hex: string): string {
	return hex.toLowerCase();
}

/**
 * Resolve ENS name to address or address to ENS name
 */
export async function resolve(options: ResolveOptions) {
	startSpinner("Resolving...");

	const { input, txt, contenthash, resolverAddress, network } = options;
	const config = getNetworkConfig(network);

	try {
		// Determine if input is an address or name
		const isInputAddress = isAddress(input);

		if (isInputAddress) {
			// Reverse resolution: address -> name (must use on-chain)
			const primaryName = await getPrimaryNameOnChain(
				input as `0x${string}`,
			);
			stopSpinner();

			if (primaryName) {
				console.log(primaryName);
			} else {
				console.log(
					colors.yellow("No primary name set for this address"),
				);
			}
			return;
		}

		// Forward resolution: name -> address
		const { label, fullName, node } = normalizeEnsName(input, network);

		// Try ENSNode first for faster lookup
		let ensNodeData = null;
		let address: `0x${string}` | null = null;
		let resolver: `0x${string}` | null = null;

		try {
			ensNodeData = await getDomainByName(fullName, network);
			if (ensNodeData?.owner?.id) {
				resolver =
					(ensNodeData.resolver?.address as `0x${string}`) || null;
			}
		} catch (error) {
			// ENSNode not available, will fall back to on-chain
		}

		// Get resolver (from ENSNode or on-chain)
		if (!resolver) {
			try {
				resolver = resolverAddress
					? (resolverAddress as `0x${string}`)
					: await getResolver(node, network);
			} catch (error) {
				stopSpinner();
				const e = error as Error;
				console.error(
					colors.red(`Error fetching resolver: ${e.message}`),
				);
				console.error(
					colors.yellow(
						`This might be a network/RPC issue. Try again or check your connection.`,
					),
				);
				return;
			}
		}

		if (
			!resolver ||
			resolver === "0x0000000000000000000000000000000000000000"
		) {
			stopSpinner();
			console.log(colors.yellow(`No resolver found for ${fullName}`));
			console.log(
				colors.gray(
					`This name may not be registered or may not have a resolver set.`,
				),
			);
			console.log(colors.gray(`Node: ${node}`));
			console.log(
				colors.gray(
					`Network: ${network || "sepolia (default)"}`,
				),
			);
			return;
		}

		// Handle TXT record query (always on-chain for accuracy)
		if (txt) {
			const value = await getTextRecord(resolver, node, txt, network);
			stopSpinner();

			if (value) {
				console.log(value);

				// Resolve avatar URI if querying the avatar key
				if (txt === "avatar") {
					try {
						const avatarResult = await resolveAvatarUri(value);
						if (avatarResult.imageUrl) {
							console.log(
								colors.dim(
									`Resolved: ${avatarResult.imageUrl}`,
								),
							);
						}
					} catch {
						// Best-effort — raw value already printed
					}
				}
			} else {
				console.log(
					colors.yellow(`No value for text record: ${txt}`),
				);
			}
			return;
		}

		// Handle contenthash query
		if (contenthash) {
			const raw = await getContenthash(resolver, node, network);
			stopSpinner();

			if (!raw) {
				console.log(
					colors.yellow("No content hash set"),
				);
			} else {
				const decoded = decodeContenthash(raw);
				console.log(decoded);
				console.log(colors.dim(raw));
			}
			return;
		}

		// Default: get address record (on-chain for accuracy)
		address = await getAddressRecord(resolver, node, network);
		stopSpinner();

		if (address) {
			console.log(address);
		} else {
			console.log(
				colors.yellow(`No address record for ${fullName}`),
			);
		}
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		console.error(colors.red(`Error resolving: ${e.message}`));
	}
}
