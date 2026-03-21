/**
 * Personhood Commands
 *
 * World ID AgentBook lookups — proof-of-personhood verification.
 */

import colors from "yoctocolors";
import { isAddress } from "viem";
import { resolvePersonhood } from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface PersonhoodCheckOptions {
  address: string;
  network?: string;
}

/**
 * Check if an address is backed by a verified human in AgentBook.
 */
export async function personhoodCheck(options: PersonhoodCheckOptions) {
  const { address, network } = options;

  if (!isAddress(address)) {
    console.error(colors.red(`Invalid address: ${address}`));
    return;
  }

  const networks =
    network === "world"
      ? (["world"] as const)
      : network === "base-sepolia"
        ? (["base-sepolia"] as const)
        : (["base", "world"] as const);

  startSpinner(`Checking personhood for ${colors.cyan(address)}...`);

  const result = await resolvePersonhood(address, { networks: [...networks] });

  stopSpinner();

  if (result.verified) {
    console.log(
      colors.green("✓") + colors.bold(" Personhood: verified"),
    );
    console.log(`  Nullifier: ${colors.cyan(result.nullifierHash!)}`);
    console.log(`  Network:   ${result.network}`);
    console.log(`  Contract:  ${result.agentBookAddress}`);
  } else {
    console.log(
      colors.red("✗") + colors.bold(" Personhood: not registered"),
    );
    console.log(
      colors.dim(
        "  This address is not registered in AgentBook on any checked network.",
      ),
    );
    console.log(
      colors.dim(
        "  Use `ensemble personhood register` to register via World ID.",
      ),
    );
  }
}
