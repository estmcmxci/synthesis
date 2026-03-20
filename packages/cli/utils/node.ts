/**
 * ENS Node Calculation Utilities
 *
 * ENS uses standard namehash() for all name types.
 * This is simpler than Basenames which uses a custom algorithm.
 */

import { namehash } from "viem";
import { normalize } from "viem/ens";
import { getNetworkConfig } from "../config/deployments";

/**
 * Calculate the root node for the parent domain (eth)
 */
export function getParentNode(): `0x${string}` {
	return namehash("eth") as `0x${string}`;
}

/**
 * Calculate the ENS node for a label (e.g., "vitalik" -> namehash("vitalik.eth"))
 */
export function calculateEnsNode(label: string): `0x${string}` {
	const normalizedLabel = normalize(label);
	return namehash(`${normalizedLabel}.eth`) as `0x${string}`;
}

/**
 * Extract the label(s) from a full ENS name
 * e.g., "vitalik.eth" -> "vitalik"
 * e.g., "sub.vitalik.eth" -> "sub.vitalik"
 * e.g., "vitalik" -> "vitalik"
 */
export function extractLabel(fullName: string): string {
	const parentSuffix = ".eth";

	let name = fullName;
	if (name.toLowerCase().endsWith(parentSuffix)) {
		name = name.slice(0, -parentSuffix.length);
	}

	return name;
}

/**
 * Check if a name is a subname (has multiple labels before .eth)
 * e.g., "sub.vitalik.eth" -> true
 * e.g., "vitalik.eth" -> false
 */
export function isSubname(input: string): boolean {
	const label = extractLabel(input);
	return label.includes(".");
}

/**
 * Get the full ENS name from a label or label path
 * e.g., "vitalik" -> "vitalik.eth"
 * e.g., "sub.vitalik" -> "sub.vitalik.eth"
 */
export function getFullEnsName(labelPath: string): string {
	const parts = labelPath.split(".");
	const normalizedParts = parts.map((part) => normalize(part));
	return `${normalizedParts.join(".")}.eth`;
}

/**
 * Check if a string is likely a full ENS name (ends with .eth)
 */
export function isFullEnsName(name: string): boolean {
	return name.toLowerCase().endsWith(".eth");
}

/**
 * Normalize and validate an ENS name input
 * Returns the normalized label and full name with standard namehash
 */
export function normalizeEnsName(
	input: string,
	network?: string,
): {
	label: string;
	fullName: string;
	node: `0x${string}`;
} {
	const labelPath = extractLabel(input);
	const fullName = getFullEnsName(labelPath);

	// ENS always uses standard namehash
	const node = namehash(fullName) as `0x${string}`;

	return { label: labelPath, fullName, node };
}
