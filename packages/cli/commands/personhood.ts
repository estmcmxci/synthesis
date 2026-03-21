/**
 * Personhood Commands
 *
 * World ID AgentBook lookups and registration — proof-of-personhood verification.
 */

import { execFileSync } from "node:child_process";
import colors from "yoctocolors";
import { isAddress } from "viem";
import { resolvePersonhood } from "@synthesis/resolver";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface PersonhoodCheckOptions {
  address: string;
  network?: string;
}

export interface PersonhoodRegisterOptions {
  address: string;
  network?: string;
  manual?: boolean;
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

/**
 * Register an address in AgentBook via World ID verification.
 *
 * Shells out to @worldcoin/agentkit-cli which handles the full
 * QR code flow (display QR → user scans with World App → ZK proof → on-chain registration).
 */
export async function personhoodRegister(options: PersonhoodRegisterOptions) {
  const { address, network = "base", manual } = options;

  if (!isAddress(address)) {
    console.error(colors.red(`Invalid address: ${address}`));
    return;
  }

  console.log(colors.bold("World ID AgentBook Registration"));
  console.log(`  Address:  ${colors.cyan(address)}`);
  console.log(`  Network:  ${network}`);
  console.log();
  console.log(
    colors.yellow(
      "This will open a World ID verification flow. You'll need to scan a QR code with the World App.",
    ),
  );
  console.log();

  const args = ["@worldcoin/agentkit-cli", "register", address, "--network", network];

  if (manual) {
    args.push("--manual");
    console.log(colors.dim("Manual mode — will print calldata instead of submitting via relay."));
    console.log();
  }

  try {
    execFileSync("npx", args, {
      stdio: "inherit",
      env: { ...process.env },
    });

    console.log();
    console.log(colors.green("✓") + colors.bold(" Registration submitted."));
    console.log(
      colors.dim("  Run `ensemble personhood check " + address + "` to verify."),
    );
  } catch (error) {
    console.log();
    console.error(
      colors.red("✗") + " Registration failed or was cancelled.",
    );
    if (error instanceof Error && "status" in error) {
      console.error(colors.dim(`  Exit code: ${(error as NodeJS.ErrnoException & { status: number }).status}`));
    }
  }
}
