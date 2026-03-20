/**
 * Renew Command
 *
 * Renew an existing ENS .eth name registration.
 */

import colors from "yoctocolors";
import { formatEther } from "viem";
import {
	startSpinner,
	stopSpinner,
	normalizeEnsName,
	getRentPrice,
	renewEnsName,
	getSignerAddress,
	getSignerAddressAsync,
	getPublicClient,
	getNetworkConfig,
	closeLedger,
	type RenewOptions,
} from "../utils";

// Duration parsing (same as register.ts)
function parseDuration(duration: string): bigint {
	const match = duration.match(/^(\d+)(y|m|d)?$/i);
	if (!match) {
		throw new Error(
			"Invalid duration format. Use: 1y, 6m, 30d, or seconds",
		);
	}

	const value = Number(match[1]);
	const unit = (match[2] || "s").toLowerCase();

	switch (unit) {
		case "y":
			return BigInt(value * 365 * 24 * 60 * 60);
		case "m":
			return BigInt(value * 30 * 24 * 60 * 60);
		case "d":
			return BigInt(value * 24 * 60 * 60);
		default:
			return BigInt(value);
	}
}

/**
 * Renew an ENS name
 */
export async function renew(options: RenewOptions) {
	const { name, duration, useLedger, accountIndex } = options;
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

		const { label, fullName } = normalizeEnsName(name, options.network);

		// Parse duration
		const durationSeconds = parseDuration(duration || "1y");
		const durationYears =
			Number(durationSeconds) / (365 * 24 * 60 * 60);

		console.log(colors.blue("\nENS Name Renewal"));
		console.log(colors.blue("================\n"));
		console.log(`${colors.blue("Name:")}      ${fullName}`);
		console.log(
			`${colors.blue("Duration:")}  ${durationYears.toFixed(1)} year(s)`,
		);

		// Get price
		startSpinner("Getting renewal price...");
		const price = await getRentPrice(
			label,
			durationSeconds,
			options.network,
		);
		stopSpinner();

		const totalPrice = price.base + price.premium;
		console.log(
			`${colors.blue("Price:")}     ${formatEther(totalPrice)} ETH`,
		);
		if (price.premium > 0n) {
			console.log(
				colors.gray(
					`  Base: ${formatEther(price.base)} ETH`,
				),
			);
			console.log(
				colors.gray(
					`  Premium: ${formatEther(price.premium)} ETH`,
				),
			);
		}

		// Send renewal transaction
		if (useLedger) {
			console.log(
				colors.yellow(
					"Please confirm the transaction on your Ledger device...",
				),
			);
		}
		startSpinner("Sending renewal transaction...");

		const txHash = await renewEnsName(
			label,
			durationSeconds,
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
					`\n✓ Successfully renewed ${fullName} for ${durationYears.toFixed(1)} year(s)`,
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
		console.error(colors.red(`Error renewing: ${e.message}`));
	} finally {
		if (useLedger) {
			await closeLedger();
		}
	}
}
