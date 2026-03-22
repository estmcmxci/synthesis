/**
 * Deploy Command — IPFS deployment via OmniPin
 *
 * Builds static export, pins to IPFS via OmniPin + Storacha,
 * and optionally sets ENS contenthash.
 */

import { execSync } from "node:child_process";
import colors from "yoctocolors";
import { startSpinner, stopSpinner } from "../utils/spinner";

export interface DeployOptions {
  dir: string;
  ens?: string;
  chain?: string;
  dryRun?: boolean;
}

/**
 * Deploy a directory to IPFS via OmniPin.
 * Optionally update ENS contenthash.
 */
export async function deploy(options: DeployOptions) {
  const { dir, ens, chain, dryRun } = options;

  console.log(colors.bold("IPFS Deployment"));
  console.log(`  ${colors.blue("Directory:")} ${dir}`);
  if (ens) console.log(`  ${colors.blue("ENS:")} ${ens}`);
  if (dryRun) console.log(`  ${colors.yellow("Dry run — no transactions will be sent")}`);
  console.log();

  // Build the OmniPin command
  const args = ["omnipin", "deploy", dir];

  if (ens) {
    args.push("--ens", ens);
    if (chain) args.push("--chain", chain);
  }

  if (dryRun) args.push("--dry-run");

  args.push("--verbose");

  startSpinner("Deploying to IPFS...");

  try {
    stopSpinner();
    // Run with inherited stdio so OmniPin output is visible
    execSync(`npx ${args.join(" ")}`, {
      stdio: "inherit",
      env: { ...process.env },
      cwd: process.cwd(),
    });

    console.log();
    console.log(colors.green("✓") + colors.bold(" Deployment complete"));
    if (ens) {
      console.log(
        colors.dim(`  Check: https://${ens}.limo`),
      );
    }
  } catch (error) {
    stopSpinner();
    console.error(colors.red("✗") + " Deployment failed");
    if (error instanceof Error && "status" in error) {
      console.error(colors.dim(`  Exit code: ${(error as NodeJS.ErrnoException & { status: number }).status}`));
    }
  }
}
