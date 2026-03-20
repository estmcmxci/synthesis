/**
 * ENSIP-5 Text Record Key Validation & ENSIP-12 Avatar URI Validation
 *
 * Pure validation functions — no network calls.
 * ENSIP-5: https://docs.ens.domains/ensip/5
 * ENSIP-12: https://docs.ens.domains/ensip/12
 */

// Standard global keys defined by ENSIP-5
export const ENSIP5_GLOBAL_KEYS = [
	"avatar",
	"description",
	"display",
	"email",
	"keywords",
	"mail",
	"notice",
	"location",
	"phone",
	"url",
	"header",
] as const;

// Well-known service keys (reverse-DNS format)
export const ENSIP5_SERVICE_KEYS = [
	"com.github",
	"com.twitter",
	"com.discord",
	"io.keybase",
	"org.telegram",
	"com.reddit",
	"com.linkedin",
	"com.warpcast",
] as const;

const STANDARD_KEYS = new Set<string>([
	...ENSIP5_GLOBAL_KEYS,
	...ENSIP5_SERVICE_KEYS,
]);

// Reverse-DNS pattern: two or more dot-separated segments starting with a TLD
const REVERSE_DNS_RE = /^[a-z]{2,}(\.[a-z0-9-]+)+$/i;

export interface TextRecordKeyValidation {
	isStandard: boolean;
	isReverseDns: boolean;
	warning: string | null;
}

/**
 * Validate an ENSIP-5 text record key.
 * Returns a warning for non-standard, non-reverse-DNS keys.
 * Warnings are advisory — they never block the transaction.
 */
export function validateTextRecordKey(key: string): TextRecordKeyValidation {
	if (STANDARD_KEYS.has(key)) {
		return { isStandard: true, isReverseDns: false, warning: null };
	}

	if (REVERSE_DNS_RE.test(key)) {
		return { isStandard: false, isReverseDns: true, warning: null };
	}

	return {
		isStandard: false,
		isReverseDns: false,
		warning:
			`"${key}" is not a standard ENSIP-5 key. ` +
			`Standard keys: ${ENSIP5_GLOBAL_KEYS.join(", ")}. ` +
			`Custom keys should use reverse-DNS format (e.g. com.myapp).`,
	};
}

// NFT URI pattern: eip155:<chainId>/<erc721|erc1155>:<0xAddress>/<tokenId>
const NFT_URI_RE =
	/^eip155:(\d+)\/(erc721|erc1155):(0x[0-9a-fA-F]{40})\/(\d+)$/;

export type AvatarUriType =
	| "https"
	| "ipfs"
	| "ipns"
	| "data"
	| "nft"
	| "unknown";

export interface NftInfo {
	chainId: number;
	standard: "erc721" | "erc1155";
	contractAddress: `0x${string}`;
	tokenId: string;
}

export interface AvatarUriValidation {
	type: AvatarUriType;
	valid: boolean;
	error: string | null;
	nft?: NftInfo;
}

/**
 * Validate an ENSIP-12 avatar URI format.
 * Checks structure only — no network calls.
 */
export function validateAvatarUri(value: string): AvatarUriValidation {
	if (!value) {
		return { type: "unknown", valid: false, error: "Empty avatar value" };
	}

	// HTTPS / HTTP URL
	if (value.startsWith("https://") || value.startsWith("http://")) {
		try {
			new URL(value);
			return { type: "https", valid: true, error: null };
		} catch {
			return { type: "https", valid: false, error: "Malformed URL" };
		}
	}

	// IPFS
	if (value.startsWith("ipfs://")) {
		const hash = value.slice(7);
		if (hash.length < 10) {
			return {
				type: "ipfs",
				valid: false,
				error: "IPFS hash too short",
			};
		}
		return { type: "ipfs", valid: true, error: null };
	}

	// IPNS
	if (value.startsWith("ipns://")) {
		const name = value.slice(7);
		if (name.length < 3) {
			return {
				type: "ipns",
				valid: false,
				error: "IPNS name too short",
			};
		}
		return { type: "ipns", valid: true, error: null };
	}

	// Data URI
	if (value.startsWith("data:")) {
		if (!value.includes(",")) {
			return {
				type: "data",
				valid: false,
				error: "Data URI missing comma separator",
			};
		}
		return { type: "data", valid: true, error: null };
	}

	// NFT URI: eip155:<chainId>/<standard>:<address>/<tokenId>
	const nftMatch = value.match(NFT_URI_RE);
	if (nftMatch) {
		return {
			type: "nft",
			valid: true,
			error: null,
			nft: {
				chainId: Number.parseInt(nftMatch[1], 10),
				standard: nftMatch[2] as "erc721" | "erc1155",
				contractAddress: nftMatch[3] as `0x${string}`,
				tokenId: nftMatch[4],
			},
		};
	}

	// Looks like an NFT URI but failed regex
	if (value.startsWith("eip155:")) {
		return {
			type: "nft",
			valid: false,
			error:
				"Invalid NFT URI format. Expected: eip155:<chainId>/<erc721|erc1155>:<0xAddress>/<tokenId>",
		};
	}

	return {
		type: "unknown",
		valid: false,
		error:
			`Unrecognized avatar URI format. Valid formats: ` +
			`https://..., ipfs://..., ipns://..., data:..., ` +
			`eip155:<chainId>/<erc721|erc1155>:<0xAddress>/<tokenId>`,
	};
}
