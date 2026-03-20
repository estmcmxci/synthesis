/**
 * Available Command
 *
 * Check if an ENS name is available for registration.
 * Uses direct contract call for real-time accuracy.
 */

import colors from "yoctocolors";
import { formatEther } from "viem";
import {
	startSpinner,
	stopSpinner,
	normalizeEnsName,
	checkAvailable,
	getRentPrice,
	getNetworkConfig,
	type AvailableOptions,
} from "../utils";

// Duration constants
const ONE_YEAR_SECONDS = BigInt(365 * 24 * 60 * 60);

/**
 * Check if ENS name is available
 */
export async function available(options: AvailableOptions) {
	startSpinner("Checking availability...");

	const { name, showPrice } = options;
	const config = getNetworkConfig(options.network);

	try {
		const { label, fullName } = normalizeEnsName(name, options.network);

		// Check availability (real-time on-chain)
		const isAvailable = await checkAvailable(label, options.network);

		stopSpinner();

		if (isAvailable) {
			console.log(colors.green(`✓ ${fullName} is available`));

			// Optionally show price
			if (showPrice !== false) {
				startSpinner("Getting price...");
				const price = await getRentPrice(
					label,
					ONE_YEAR_SECONDS,
					options.network,
				);
				stopSpinner();

				const total = price.base + price.premium;
				console.log(
					colors.blue(
						`  Price: ${formatEther(total)} ETH (1 year)`,
					),
				);
				if (price.premium > 0n) {
					console.log(
						colors.gray(
							`    Base: ${formatEther(price.base)} ETH`,
						),
					);
					console.log(
						colors.gray(
							`    Premium: ${formatEther(price.premium)} ETH`,
						),
					);
				}
			}
		} else {
			console.log(colors.red(`✗ ${fullName} is taken`));
		}
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		console.error(
			colors.red(`Error checking availability: ${e.message}`),
		);
	}
}
