/**
 * ENSIP-12 Avatar Resolution
 *
 * Resolves avatar URIs to actual image URLs.
 * Handles HTTPS, IPFS/IPNS, data URIs, and NFT URIs (ERC-721 / ERC-1155).
 * Uses viem readContract for on-chain token URI lookups.
 */

import type { PublicClient } from "viem";
import { validateAvatarUri } from "./ensip5";
import { getPublicClient } from "./viem";

// Minimal ABIs for tokenURI / uri lookups
const ERC721_TOKEN_URI_ABI = [
	{
		name: "tokenURI",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "tokenId", type: "uint256" }],
		outputs: [{ type: "string" }],
	},
] as const;

const ERC1155_URI_ABI = [
	{
		name: "uri",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "id", type: "uint256" }],
		outputs: [{ type: "string" }],
	},
] as const;

const IPFS_GATEWAY = "https://ipfs.io";

/**
 * Convert an ipfs:// or ipns:// URI to a gateway URL
 */
export function ipfsToGatewayUrl(uri: string): string {
	if (uri.startsWith("ipfs://")) {
		return `${IPFS_GATEWAY}/ipfs/${uri.slice(7)}`;
	}
	if (uri.startsWith("ipns://")) {
		return `${IPFS_GATEWAY}/ipns/${uri.slice(7)}`;
	}
	return uri;
}

export interface AvatarResolution {
	rawUri: string;
	imageUrl: string | null;
	type: string;
	error: string | null;
	metadata?: Record<string, unknown>;
}

/**
 * Resolve an avatar URI to an image URL.
 *
 * - HTTPS / HTTP → pass through
 * - data: → pass through
 * - ipfs:// / ipns:// → convert to gateway URL
 * - eip155 NFT URI → call tokenURI/uri on-chain → fetch metadata → extract image
 *
 * Never throws — all errors returned in the result.
 */
export async function resolveAvatarUri(
	rawUri: string,
	client?: PublicClient,
): Promise<AvatarResolution> {
	const validation = validateAvatarUri(rawUri);

	if (!validation.valid) {
		return {
			rawUri,
			imageUrl: null,
			type: validation.type,
			error: validation.error,
		};
	}

	try {
		switch (validation.type) {
			case "https":
				return { rawUri, imageUrl: rawUri, type: "https", error: null };

			case "data":
				return { rawUri, imageUrl: rawUri, type: "data", error: null };

			case "ipfs":
			case "ipns":
				return {
					rawUri,
					imageUrl: ipfsToGatewayUrl(rawUri),
					type: validation.type,
					error: null,
				};

			case "nft": {
				const nft = validation.nft!;
				const rpcClient = client || getPublicClient("mainnet");

				// Read tokenURI (ERC-721) or uri (ERC-1155)
				let metadataUri: string;
				if (nft.standard === "erc721") {
					metadataUri = (await rpcClient.readContract({
						address: nft.contractAddress,
						abi: ERC721_TOKEN_URI_ABI,
						functionName: "tokenURI",
						args: [BigInt(nft.tokenId)],
					})) as string;
				} else {
					metadataUri = (await rpcClient.readContract({
						address: nft.contractAddress,
						abi: ERC1155_URI_ABI,
						functionName: "uri",
						args: [BigInt(nft.tokenId)],
					})) as string;

					// ERC-1155 {id} template substitution
					if (metadataUri.includes("{id}")) {
						const hexId = BigInt(nft.tokenId)
							.toString(16)
							.padStart(64, "0");
						metadataUri = metadataUri.replace("{id}", hexId);
					}
				}

				// Convert IPFS metadata URI to gateway URL
				const metadataUrl = ipfsToGatewayUrl(metadataUri);

				// Handle data URIs containing JSON directly
				let metadata: Record<string, unknown>;
				if (metadataUrl.startsWith("data:")) {
					const commaIndex = metadataUrl.indexOf(",");
					const jsonStr = metadataUrl.slice(commaIndex + 1);
					metadata = JSON.parse(decodeURIComponent(jsonStr));
				} else {
					// Fetch metadata JSON
					const response = await fetch(metadataUrl);
					if (!response.ok) {
						return {
							rawUri,
							imageUrl: null,
							type: "nft",
							error: `Metadata fetch failed: ${response.status}`,
						};
					}
					metadata = (await response.json()) as Record<
						string,
						unknown
					>;
				}

				// Extract image field
				const imageField =
					(metadata.image as string) ||
					(metadata.image_url as string) ||
					null;

				if (!imageField) {
					return {
						rawUri,
						imageUrl: null,
						type: "nft",
						error: "No image field in NFT metadata",
						metadata,
					};
				}

				// Convert IPFS image URLs
				const imageUrl = ipfsToGatewayUrl(imageField);

				return {
					rawUri,
					imageUrl,
					type: "nft",
					error: null,
					metadata,
				};
			}

			default:
				return {
					rawUri,
					imageUrl: null,
					type: validation.type,
					error: "Unsupported URI type",
				};
		}
	} catch (error) {
		const e = error as Error;
		return {
			rawUri,
			imageUrl: null,
			type: validation.type,
			error: `Resolution failed: ${e.message}`,
		};
	}
}
