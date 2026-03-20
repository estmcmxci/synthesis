/**
 * Edit Commands
 *
 * Set records for an ENS name: txt, address, primary.
 */

import colors from "yoctocolors";
import { isAddress } from "viem";
import {
	startSpinner,
	stopSpinner,
	normalizeEnsName,
	getResolver,
	setTextRecordOnChain,
	setAddressRecordOnChain,
	setPrimaryNameOnChain,
	getSignerAddress,
	getSignerAddressAsync,
	getPublicClient,
	getNetworkConfig,
	closeLedger,
	validateTextRecordKey,
	validateAvatarUri,
	type EditTxtOptions,
	type EditAddressOptions,
	type EditPrimaryOptions,
} from "../utils";

/**
 * Set a text record
 */
export async function setTxt(options: EditTxtOptions) {
	const {
		name,
		key,
		value,
		resolverAddress,
		network,
		useLedger,
		accountIndex,
	} = options;
	const config = getNetworkConfig(network);

	try {
		// Get signer address
		let signerAddress: `0x${string}` | null;

		if (useLedger) {
			console.log(colors.blue("Connecting to Ledger..."));
			signerAddress = await getSignerAddressAsync(
				true,
				accountIndex || 0,
			);
			console.log(colors.green("✓ Connected to Ledger"));
			console.log(colors.dim(`  Address: ${signerAddress}`));
			console.log(
				colors.dim(`  Account Index: ${accountIndex || 0}`),
			);
		} else {
			signerAddress = getSignerAddress();
			if (!signerAddress) {
				console.error(
					colors.red("Error: ENS_PRIVATE_KEY not set"),
				);
				console.error(
					colors.yellow(
						"Set the environment variable or use --ledger flag",
					),
				);
				return;
			}
		}

		const { fullName, node } = normalizeEnsName(name, network);

		// Get resolver if not provided
		const resolver = resolverAddress
			? (resolverAddress as `0x${string}`)
			: await getResolver(node, network);

		if (!resolver) {
			console.error(
				colors.red(`No resolver found for ${fullName}`),
			);
			return;
		}

		const isClearing = value === "" || value === "null";
		const actualValue = value === "null" ? "" : value;

		// ENSIP-5 key validation (advisory only)
		if (!isClearing) {
			const keyCheck = validateTextRecordKey(key);
			if (keyCheck.warning) {
				console.log(colors.yellow(`Warning: ${keyCheck.warning}`));
			}

			// ENSIP-12 avatar URI validation
			if (key === "avatar") {
				const avatarCheck = validateAvatarUri(actualValue);
				if (!avatarCheck.valid) {
					console.log(
						colors.yellow(
							`Warning: ${avatarCheck.error}`,
						),
					);
				} else {
					console.log(
						colors.dim(
							`Avatar type: ${avatarCheck.type}${avatarCheck.nft ? ` (${avatarCheck.nft.standard} on chain ${avatarCheck.nft.chainId})` : ""}`,
						),
					);
				}
			}
		}

		if (useLedger) {
			console.log(
				colors.yellow(
					"Please confirm the transaction on your Ledger device...",
				),
			);
		}
		startSpinner(
			isClearing
				? "Clearing text record..."
				: "Setting text record...",
		);

		const txHash = await setTextRecordOnChain(
			node,
			key,
			actualValue,
			resolver,
			network,
			useLedger,
			accountIndex,
		);

		stopSpinner();
		console.log(colors.green(`✓ Transaction sent: ${txHash}`));

		// Wait for confirmation
		startSpinner("Waiting for confirmation...");
		const client = getPublicClient(network);
		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			confirmations: 2,
		});

		stopSpinner();

		if (receipt.status === "success") {
			if (isClearing) {
				console.log(
					colors.green(`✓ Text record "${key}" cleared`),
				);
			} else {
				console.log(
					colors.green(
						`✓ Text record "${key}" set to "${actualValue}"`,
					),
				);
			}
			console.log(
				`${colors.blue("Explorer:")} ${config.explorerUrl}/tx/${txHash}`,
			);
		} else {
			console.error(colors.red("✗ Transaction reverted"));
		}
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		console.error(
			colors.red(`Error setting text record: ${e.message}`),
		);
	} finally {
		if (useLedger) {
			await closeLedger();
		}
	}
}

/**
 * Set address record
 */
export async function setAddress(options: EditAddressOptions) {
	const {
		name,
		value,
		resolverAddress,
		network,
		useLedger,
		accountIndex,
	} = options;
	const config = getNetworkConfig(network);

	try {
		// Get signer address
		let signerAddress: `0x${string}` | null;

		if (useLedger) {
			console.log(colors.blue("Connecting to Ledger..."));
			signerAddress = await getSignerAddressAsync(
				true,
				accountIndex || 0,
			);
			console.log(colors.green("✓ Connected to Ledger"));
			console.log(colors.dim(`  Address: ${signerAddress}`));
			console.log(
				colors.dim(`  Account Index: ${accountIndex || 0}`),
			);
		} else {
			signerAddress = getSignerAddress();
			if (!signerAddress) {
				console.error(
					colors.red("Error: ENS_PRIVATE_KEY not set"),
				);
				console.error(
					colors.yellow(
						"Set the environment variable or use --ledger flag",
					),
				);
				return;
			}
		}

		// Validate address
		if (!isAddress(value)) {
			console.error(colors.red("Invalid address format"));
			return;
		}

		const { fullName, node } = normalizeEnsName(name, network);

		// Get resolver if not provided
		const resolver = resolverAddress
			? (resolverAddress as `0x${string}`)
			: await getResolver(node, network);

		if (!resolver) {
			console.error(
				colors.red(`No resolver found for ${fullName}`),
			);
			return;
		}

		if (useLedger) {
			console.log(
				colors.yellow(
					"Please confirm the transaction on your Ledger device...",
				),
			);
		}
		startSpinner("Setting address record...");

		const txHash = await setAddressRecordOnChain(
			node,
			value as `0x${string}`,
			resolver,
			network,
			useLedger,
			accountIndex,
		);

		stopSpinner();
		console.log(colors.green(`✓ Transaction sent: ${txHash}`));

		// Wait for confirmation
		startSpinner("Waiting for confirmation...");
		const client = getPublicClient(network);
		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			confirmations: 2,
		});

		stopSpinner();

		if (receipt.status === "success") {
			console.log(
				colors.green(`✓ Address record set to ${value}`),
			);
			console.log(
				`${colors.blue("Explorer:")} ${config.explorerUrl}/tx/${txHash}`,
			);
		} else {
			console.error(colors.red("✗ Transaction reverted"));
		}
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		console.error(
			colors.red(`Error setting address record: ${e.message}`),
		);
	} finally {
		if (useLedger) {
			await closeLedger();
		}
	}
}

/**
 * Set primary name (reverse record)
 */
export async function setPrimary(options: EditPrimaryOptions) {
	const { name, network, useLedger, accountIndex } = options;
	const config = getNetworkConfig(network);

	try {
		// Get signer address
		let signerAddress: `0x${string}` | null;

		if (useLedger) {
			console.log(colors.blue("Connecting to Ledger..."));
			signerAddress = await getSignerAddressAsync(
				true,
				accountIndex || 0,
			);
			console.log(colors.green("✓ Connected to Ledger"));
			console.log(colors.dim(`  Address: ${signerAddress}`));
			console.log(
				colors.dim(`  Account Index: ${accountIndex || 0}`),
			);
		} else {
			signerAddress = getSignerAddress();
			if (!signerAddress) {
				console.error(
					colors.red("Error: ENS_PRIVATE_KEY not set"),
				);
				console.error(
					colors.yellow(
						"Set the environment variable or use --ledger flag",
					),
				);
				return;
			}
		}

		const { fullName } = normalizeEnsName(name, network);

		console.log(
			colors.blue(`Setting primary name for ${signerAddress}...`),
		);
		if (useLedger) {
			console.log(
				colors.yellow(
					"Please confirm the transaction on your Ledger device...",
				),
			);
		}
		startSpinner("Sending transaction...");

		const txHash = await setPrimaryNameOnChain(
			fullName,
			network,
			useLedger,
			accountIndex,
		);

		stopSpinner();
		console.log(colors.green(`✓ Transaction sent: ${txHash}`));

		// Wait for confirmation
		startSpinner("Waiting for confirmation...");
		const client = getPublicClient(network);
		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			confirmations: 2,
		});

		stopSpinner();

		if (receipt.status === "success") {
			console.log(
				colors.green(`✓ Primary name set to ${fullName}`),
			);
			console.log(
				colors.blue(`${signerAddress} → ${fullName}`),
			);
			console.log(
				`${colors.blue("Explorer:")} ${config.explorerUrl}/tx/${txHash}`,
			);
		} else {
			console.error(colors.red("✗ Transaction reverted"));
		}
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		console.error(
			colors.red(`Error setting primary name: ${e.message}`),
		);
	} finally {
		if (useLedger) {
			await closeLedger();
		}
	}
}
