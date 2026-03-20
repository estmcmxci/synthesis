/**
 * Transfer Command
 *
 * Transfer ownership of an ENS .eth name to another address.
 * Uses ERC-721 safeTransferFrom on the BaseRegistrar contract.
 */

import colors from "yoctocolors";
import { isAddress } from "viem";
import {
	startSpinner,
	stopSpinner,
	normalizeEnsName,
	transferEnsName,
	getSignerAddress,
	getSignerAddressAsync,
	getPublicClient,
	getNetworkConfig,
	closeLedger,
	type TransferOptions,
} from "../utils";

/**
 * Transfer an ENS name to a new owner
 */
export async function transfer(options: TransferOptions) {
	const { name, to, useLedger, accountIndex } = options;
	const config = getNetworkConfig(options.network);

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

		// Validate recipient address
		if (!isAddress(to)) {
			console.error(colors.red("Invalid recipient address"));
			return;
		}

		const { label, fullName } = normalizeEnsName(name, options.network);

		console.log(colors.blue("\nENS Name Transfer"));
		console.log(colors.blue("=================\n"));
		console.log(`${colors.blue("Name:")}  ${fullName}`);
		console.log(`${colors.blue("From:")}  ${signerAddress}`);
		console.log(`${colors.blue("To:")}    ${to}`);

		// Send transfer transaction
		if (useLedger) {
			console.log(
				colors.yellow(
					"Please confirm the transaction on your Ledger device...",
				),
			);
		}
		startSpinner("Sending transfer transaction...");

		const txHash = await transferEnsName(
			label,
			to as `0x${string}`,
			options.network,
			useLedger,
			accountIndex,
		);

		stopSpinner();
		console.log(colors.green(`✓ Transaction sent: ${txHash}`));

		// Wait for confirmation
		startSpinner("Waiting for confirmation...");
		const client = getPublicClient(options.network);
		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			confirmations: 2,
		});

		stopSpinner();

		if (receipt.status === "success") {
			console.log(
				colors.green(
					`\n✓ Successfully transferred ${fullName} to ${to}`,
				),
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
		console.error(colors.red(`Error transferring: ${e.message}`));
	} finally {
		if (useLedger) {
			await closeLedger();
		}
	}
}
