/**
 * Agent Identity Commands
 *
 * ERC-8004 registration, ENSIP-25 linking, and agent info queries.
 */

import colors from "yoctocolors";
import { decodeEventLog, parseAbi, zeroAddress } from "viem";
import {
	startSpinner,
	stopSpinner,
	normalizeEnsName,
	getResolver,
	setTextRecordOnChain,
	getSignerAddress,
	getSignerAddressAsync,
	closeLedger,
	IDENTITY_REGISTRY_8004_ABI,
	getAgentTokenURI,
	getAgentOwner,
	type AgentRegisterOptions,
	type AgentLinkOptions,
	type AgentInfoOptions,
} from "../utils";
import {
	resolveAgentChain,
	getNetworkConfig,
} from "../config/deployments";
import { createChainPublicClient, createChainWalletClient } from "../utils/viem";
import { buildEnsip25Key } from "../utils/erc7930";

/**
 * Register an agent on ERC-8004 Identity Registry
 * Optionally link to ENS name via ENSIP-25
 */
export async function registerAgent(options: AgentRegisterOptions) {
	const {
		name,
		chain,
		nameChain,
		services,
		mcp,
		http: httpEndpoint,
		link,
		network,
		useLedger,
		accountIndex,
	} = options;

	try {
		// Resolve the chain for ERC-8004 registration
		const agentChain = resolveAgentChain(chain);

		// Get signer address
		let signerAddress: `0x${string}` | null;
		if (useLedger) {
			console.log(colors.blue("Connecting to Ledger..."));
			signerAddress = await getSignerAddressAsync(true, accountIndex || 0);
			console.log(colors.green(`✓ Connected to Ledger`));
			console.log(colors.dim(`  Address: ${signerAddress}`));
		} else {
			signerAddress = getSignerAddress();
			if (!signerAddress) {
				console.error(colors.red("Error: ENS_PRIVATE_KEY not set"));
				console.error(colors.yellow("Set the environment variable or use --ledger flag"));
				return;
			}
		}

		// Build agent metadata
		const metadata: Record<string, unknown> = { name };
		const serviceList: { type: string; url: string }[] = [];

		if (mcp) serviceList.push({ type: "mcp", url: mcp });
		if (httpEndpoint) serviceList.push({ type: "http", url: httpEndpoint });
		if (services) {
			try {
				const parsed = JSON.parse(services);
				if (Array.isArray(parsed)) serviceList.push(...parsed);
			} catch {
				console.error(colors.red("Error: --services must be valid JSON array"));
				return;
			}
		}
		if (serviceList.length > 0) metadata.services = serviceList;

		// Encode as data URI (base64 JSON)
		const json = JSON.stringify(metadata);
		const base64 = Buffer.from(json).toString("base64");
		const agentURI = `data:application/json;base64,${base64}`;

		console.log(colors.blue(`Registering agent on ${chain || "base"} (chain ${agentChain.chainId})...`));
		console.log(colors.dim(`  ENS name: ${name}`));
		console.log(colors.dim(`  Registry: ${agentChain.identityRegistry8004}`));

		if (useLedger) {
			console.log(colors.yellow("Please confirm the transaction on your Ledger device..."));
		}
		startSpinner("Sending registration transaction...");

		// Create wallet client for the agent chain
		const wallet = await createChainWalletClient(
			agentChain.chainId,
			agentChain.rpcUrl,
			useLedger,
			accountIndex,
		);
		if (!wallet) {
			stopSpinner();
			console.error(colors.red("Error: Wallet not configured"));
			return;
		}

		const txHash = await wallet.writeContract({
			address: agentChain.identityRegistry8004,
			abi: IDENTITY_REGISTRY_8004_ABI,
			functionName: "register",
			args: [agentURI],
		});

		stopSpinner();
		console.log(colors.green(`✓ Transaction sent: ${txHash}`));

		// Wait for confirmation and extract agent ID from Transfer event
		startSpinner("Waiting for confirmation...");
		const client = createChainPublicClient(agentChain.chainId, agentChain.rpcUrl);
		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			confirmations: 2,
		});
		stopSpinner();

		if (receipt.status !== "success") {
			console.error(colors.red("✗ Transaction reverted"));
			return;
		}

		// Extract agent ID from Transfer event (ERC-721: Transfer(address(0), to, tokenId))
		let agentId: string | null = null;
		for (const log of receipt.logs) {
			try {
				const event = decodeEventLog({
					abi: parseAbi(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"]),
					data: log.data,
					topics: log.topics,
				});
				if (event.eventName === "Transfer" && event.args.from === zeroAddress) {
					agentId = event.args.tokenId.toString();
					break;
				}
			} catch {
				// Not the Transfer event, skip
			}
		}

		if (!agentId) {
			console.error(colors.red("✗ Could not extract agent ID from transaction receipt"));
			return;
		}

		console.log(colors.green(`✓ Agent registered!`));
		console.log(colors.blue(`  Agent ID: #${agentId}`));
		console.log(`  ${colors.blue("Explorer:")} ${agentChain.explorerUrl}/tx/${txHash}`);
		console.log(`  ${colors.blue("8004scan:")} https://8004.app/agent/${agentId}`);

		// Optionally link to ENS name via ENSIP-25
		if (link) {
			console.log("");
			await linkAgent({
				name,
				agentId,
				chain,
				nameChain,
				network,
				useLedger,
				accountIndex,
			});
		}
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		console.error(colors.red(`Error registering agent: ${e.message}`));
	} finally {
		if (useLedger) {
			await closeLedger();
		}
	}
}

/**
 * Link an existing ERC-8004 agent to an ENS name via ENSIP-25 text record
 */
export async function linkAgent(options: AgentLinkOptions) {
	const {
		name,
		agentId,
		chain,
		nameChain,
		network,
		useLedger,
		accountIndex,
	} = options;

	try {
		const agentChain = resolveAgentChain(chain);

		// Resolve which network the ENS name lives on
		const ensNetwork = nameChain || network || "mainnet";

		const { fullName, node } = normalizeEnsName(name, ensNetwork);

		// Build ENSIP-25 key
		const ensip25Key = buildEnsip25Key(
			agentChain.chainId,
			agentChain.identityRegistry8004,
			agentId,
		);

		console.log(colors.blue(`Linking agent #${agentId} to ${fullName}...`));
		console.log(colors.dim(`  ENSIP-25 key: ${ensip25Key}`));
		console.log(colors.dim(`  Value: "1" (linked)`));

		// Get resolver
		const resolver = await getResolver(node, ensNetwork);
		if (!resolver) {
			console.error(colors.red(`No resolver found for ${fullName}`));
			return;
		}

		if (useLedger) {
			console.log(colors.yellow("Please confirm the transaction on your Ledger device..."));
		}
		startSpinner("Setting ENSIP-25 text record...");

		const txHash = await setTextRecordOnChain(
			node,
			ensip25Key,
			"1",
			resolver,
			ensNetwork,
			useLedger,
			accountIndex,
		);

		stopSpinner();
		console.log(colors.green(`✓ Transaction sent: ${txHash}`));

		startSpinner("Waiting for confirmation...");
		const config = getNetworkConfig(ensNetwork);
		const client = createChainPublicClient(config.chainId, config.rpcUrl);
		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			confirmations: 2,
		});
		stopSpinner();

		if (receipt.status === "success") {
			console.log(colors.green(`✓ Agent #${agentId} linked to ${fullName}`));
			console.log(`  ${colors.blue("Explorer:")} ${config.explorerUrl}/tx/${txHash}`);
		} else {
			console.error(colors.red("✗ Transaction reverted"));
		}
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		console.error(colors.red(`Error linking agent: ${e.message}`));
	} finally {
		if (useLedger) {
			await closeLedger();
		}
	}
}

/**
 * Look up an ERC-8004 agent's metadata, owner, and registration details
 */
export async function agentInfo(options: AgentInfoOptions) {
	const { agentId, chain } = options;

	try {
		const agentChain = resolveAgentChain(chain);

		console.log(colors.blue(`Looking up agent #${agentId} on chain ${agentChain.chainId}...`));
		startSpinner("Querying ERC-8004 registry...");

		const [tokenURI, owner] = await Promise.all([
			getAgentTokenURI(agentChain, agentId),
			getAgentOwner(agentChain, agentId),
		]);

		stopSpinner();

		console.log(colors.green(`✓ Agent #${agentId}`));
		console.log(`  ${colors.blue("Owner:")} ${owner}`);
		console.log(`  ${colors.blue("Registry:")} ${agentChain.identityRegistry8004}`);
		console.log(`  ${colors.blue("Chain ID:")} ${agentChain.chainId}`);

		// Decode tokenURI if it's a data URI
		if (tokenURI.startsWith("data:application/json;base64,")) {
			const base64 = tokenURI.replace("data:application/json;base64,", "");
			try {
				const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
				console.log(`  ${colors.blue("Metadata:")}`);
				for (const [key, value] of Object.entries(decoded)) {
					if (key === "services" && Array.isArray(value)) {
						console.log(`    ${colors.dim("services:")}`);
						for (const svc of value) {
							const s = svc as { type: string; url: string };
							console.log(`      - ${s.type}: ${s.url}`);
						}
					} else {
						console.log(`    ${colors.dim(`${key}:`)} ${value}`);
					}
				}
			} catch {
				console.log(`  ${colors.blue("Token URI:")} ${tokenURI}`);
			}
		} else {
			console.log(`  ${colors.blue("Token URI:")} ${tokenURI}`);
		}

		console.log(`  ${colors.blue("8004scan:")} https://8004.app/agent/${agentId}`);
		console.log(`  ${colors.blue("Explorer:")} ${agentChain.explorerUrl}/address/${agentChain.identityRegistry8004}`);
	} catch (error) {
		stopSpinner();
		const e = error as Error;
		if (e.message.includes("ERC721") || e.message.includes("0x7e273289")) {
			console.error(colors.red(`Agent #${agentId} not found on chain ${(chain || "base")}`));
		} else {
			console.error(colors.red(`Error querying agent: ${e.message}`));
		}
	}
}
