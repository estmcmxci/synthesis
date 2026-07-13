/**
 * Agent Identity Commands
 *
 * ERC-8004 registration through the canonical Adapter8004 (binds the agent
 * to the ENS name's wrapped NameWrapper token), ENSIP-25 linking, and agent
 * info queries.
 */

import colors from "yoctocolors";
import { decodeEventLog, parseAbi, zeroAddress } from "viem";
import {
	startSpinner,
	stopSpinner,
	normalizeEnsName,
	getResolver,
	getOwner,
	getTextRecordStrict,
	setTextRecordOnChain,
	getSignerAddress,
	getSignerAddressAsync,
	closeLedger,
	getAgentTokenURI,
	getAgentOwner,
	getAdapterBinding,
	getBindingTokenHolder,
	holdsWrappedName,
	ADAPTER_8004_ABI,
	ADAPTER_TOKEN_STANDARD,
	ADAPTER_TOKEN_STANDARD_NAMES,
	type AgentRegisterOptions,
	type AgentLinkOptions,
	type AgentInfoOptions,
} from "../utils";
import {
	resolveAgentChain,
	getNetworkConfig,
} from "../config/deployments";
import { createChainPublicClient, createChainWalletClient } from "../utils/viem";
import { buildEnsip25Key } from "@synthesis/resolver";
import { resolvePersonhood } from "@synthesis/resolver";

/**
 * Register an agent through the canonical Adapter8004.
 *
 * The adapter mints the agent on the chain's canonical ERC-8004 registry and
 * immutably binds it to the ENS name's wrapped NameWrapper token — the
 * contract itself enforces that the caller holds that token, so the
 * registration is cryptographically tied to name ownership (unlike the old
 * direct-registry flow, where any signer could register and the ENS link was
 * a bare self-assertion).
 *
 * Requires the name to be wrapped already. Wrapping is a manual, one-time
 * operator action (ENS Manager app, or NameWrapper.wrapETH2LD) — this
 * command fails with a clear message rather than auto-wrapping or falling
 * back to the unverifiable direct-registry path.
 *
 * Optionally links to the ENS name via ENSIP-25 (--link).
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
		// Adapter registration is chain-locked to the network where the ENS
		// name (and its NameWrapper token) lives — the adapter's control check
		// is NameWrapper.balanceOf on its own chain.
		const ensNetwork = nameChain || network || "mainnet";
		const config = getNetworkConfig(ensNetwork);
		if (!config.adapter8004) {
			console.error(
				colors.red(`Error: no canonical Adapter8004 deployment on ${ensNetwork}`),
			);
			return;
		}
		if (chain) {
			const requested = resolveAgentChain(chain);
			if (requested.chainId !== config.chainId) {
				console.error(
					colors.red(
						`Error: --chain ${chain} conflicts with the name's network (${ensNetwork}).`,
					),
				);
				console.error(
					colors.yellow(
						"  Adapter8004 registration must happen on the chain holding the wrapped name — omit --chain or pass the name's own network.",
					),
				);
				return;
			}
		}

		const { fullName, node } = normalizeEnsName(name, ensNetwork);

		// Get signer address
		let signerAddress: `0x${string}` | null;
		if (useLedger) {
			console.log(colors.blue("Connecting to Ledger..."));
			signerAddress = await getSignerAddressAsync(true, accountIndex || 0);
			console.log(colors.green(`✓ Connected to Ledger`));
			console.log(colors.dim(`  Address: ${signerAddress}`));
		} else {
			signerAddress = getSignerAddress();
		}
		if (!signerAddress) {
			console.error(colors.red("Error: ENS_PRIVATE_KEY not set"));
			console.error(colors.yellow("Set the environment variable or use --ledger flag"));
			return;
		}

		// Preflight 1: the name must be wrapped. Adapter8004's control check
		// is strictly NameWrapper.balanceOf — there is no unwrapped-name path.
		startSpinner(`Checking ${fullName} is wrapped...`);
		const registryOwner = await getOwner(node, ensNetwork);
		if (!registryOwner) {
			stopSpinner();
			console.error(colors.red(`✗ ${fullName} not found on ${ensNetwork}`));
			return;
		}
		if (registryOwner.toLowerCase() !== config.nameWrapper.toLowerCase()) {
			stopSpinner();
			console.error(colors.red(`✗ ${fullName} is not wrapped`));
			console.error(
				colors.yellow(
					`  Adapter8004 binds the wrapped NameWrapper token; the registry owner is ${registryOwner}, not the NameWrapper.`,
				),
			);
			console.error(
				colors.yellow(
					`  Wrap the name first (one-time manual step: ENS Manager app → ${fullName} → "Wrap Name", or NameWrapper.wrapETH2LD), then re-run this command.`,
				),
			);
			return;
		}

		// Preflight 2: the signer must hold the wrapped token — the exact
		// check the adapter's register() enforces on-chain. Failing here saves
		// a reverted transaction.
		const holds = await holdsWrappedName(signerAddress, node, ensNetwork);
		stopSpinner();
		if (!holds) {
			console.error(
				colors.red(
					`✗ Signer ${signerAddress} does not hold the wrapped token for ${fullName}`,
				),
			);
			console.error(
				colors.yellow(
					"  Adapter8004.register() requires the caller to hold the name's NameWrapper ERC-1155 token. Sign with the wallet that owns the wrapped name.",
				),
			);
			return;
		}
		console.log(colors.green(`✓ ${fullName} is wrapped and held by signer`));

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

		console.log(colors.blue(`Registering agent via Adapter8004 on ${ensNetwork} (chain ${config.chainId})...`));
		console.log(colors.dim(`  ENS name: ${fullName}`));
		console.log(colors.dim(`  Adapter:  ${config.adapter8004}`));
		console.log(colors.dim(`  Registry: ${config.identityRegistry8004} (underlying ERC-8004)`));
		console.log(colors.dim(`  Binding:  NameWrapper ${config.nameWrapper} #${BigInt(node)}`));

		if (useLedger) {
			console.log(colors.yellow("Please confirm the transaction on your Ledger device..."));
		}
		startSpinner("Sending registration transaction...");

		const wallet = await createChainWalletClient(
			config.chainId,
			config.rpcUrl,
			useLedger,
			accountIndex,
		);
		if (!wallet) {
			stopSpinner();
			console.error(colors.red("Error: Wallet not configured"));
			return;
		}

		const txHash = await wallet.writeContract({
			account: wallet.account ?? null,
			chain: wallet.chain,
			address: config.adapter8004,
			abi: ADAPTER_8004_ABI,
			functionName: "register",
			args: [
				ADAPTER_TOKEN_STANDARD.ERC1155,
				config.nameWrapper,
				BigInt(node),
				agentURI,
			],
		});

		stopSpinner();
		console.log(colors.green(`✓ Transaction sent: ${txHash}`));

		// Wait for confirmation and extract the agent ID from the adapter's
		// AgentBound event (falling back to the registry's ERC-721 mint
		// Transfer, which lands in the same receipt).
		startSpinner("Waiting for confirmation...");
		const client = createChainPublicClient(config.chainId, config.rpcUrl);
		const receipt = await client.waitForTransactionReceipt({
			hash: txHash,
			confirmations: 2,
		});
		stopSpinner();

		if (receipt.status !== "success") {
			console.error(colors.red("✗ Transaction reverted"));
			return;
		}

		let agentId: string | null = null;
		for (const log of receipt.logs) {
			try {
				const event = decodeEventLog({
					abi: ADAPTER_8004_ABI,
					data: log.data,
					topics: log.topics,
				});
				if (event.eventName === "AgentBound") {
					agentId = event.args.agentId.toString();
					break;
				}
			} catch {
				// Not the AgentBound event, skip
			}
		}
		if (!agentId) {
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
		}

		if (!agentId) {
			console.error(colors.red("✗ Could not extract agent ID from transaction receipt"));
			return;
		}

		console.log(colors.green(`✓ Agent registered and bound to ${fullName}!`));
		console.log(colors.blue(`  Agent ID: #${agentId}`));
		console.log(`  ${colors.blue("Explorer:")} ${config.explorerUrl}/tx/${txHash}`);
		console.log(`  ${colors.blue("8004scan:")} https://8004.app/agent/${agentId}`);

		// Optionally link to ENS name via ENSIP-25
		if (link) {
			console.log("");
			await linkAgent({
				name,
				agentId,
				// The agent was minted on the name's own chain — the ENSIP-25
				// key must point at that chain's canonical registry.
				chain: ensNetwork,
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
		console.log(
			colors.dim(`  This requires up to two transactions (ENSIP-25 record + agent-ids index).`),
		);

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

		if (receipt.status !== "success") {
			console.error(colors.red("✗ Transaction reverted"));
			return;
		}

		console.log(colors.green(`✓ ENSIP-25 record set`));
		console.log(`  ${colors.blue("Explorer:")} ${config.explorerUrl}/tx/${txHash}`);

		// Update the agent-ids index so the resolver can discover this agent.
		// ENS exposes no text-record enumeration, so the resolver reads the
		// `agent-ids` JSON array to know which IDs to look up under the
		// ENSIP-25 prefix. Without this write the link is invisible.
		//
		// Use the strict reader: a transient RPC failure here is NOT the same
		// as "no record exists". Treating it as empty would let us silently
		// overwrite a populated `agent-ids` array with `[<this id>]` and
		// erase previously linked agents. Surface the error and bail.
		let existingRaw: string | null;
		try {
			existingRaw = await getTextRecordStrict(resolver, node, "agent-ids", ensNetwork);
		} catch (readErr) {
			console.error(
				colors.red(
					`✗ Failed to read existing agent-ids before update: ${(readErr as Error).message}`,
				),
			);
			console.error(
				colors.yellow(
					`  ENSIP-25 record is set, but agent-ids was NOT updated. Re-run \`ensemble agent link ${fullName} ${agentId}\` once the RPC recovers.`,
				),
			);
			return;
		}

		let ids: string[] = [];
		if (existingRaw) {
			try {
				const parsed = JSON.parse(existingRaw);
				if (Array.isArray(parsed)) {
					ids = parsed.filter((x): x is string => typeof x === "string");
				} else {
					// Non-array JSON is unexpected and would be silently overwritten;
					// refuse instead and let the user inspect/fix.
					console.error(
						colors.red(
							`✗ agent-ids on ${fullName} is not a JSON array (got: ${existingRaw.slice(0, 80)}). Refusing to overwrite. Inspect with \`ensemble edit txt ${fullName} agent-ids\`.`,
						),
					);
					return;
				}
			} catch {
				console.error(
					colors.red(
						`✗ agent-ids on ${fullName} is not valid JSON (got: ${existingRaw.slice(0, 80)}). Refusing to overwrite. Inspect with \`ensemble edit txt ${fullName} agent-ids\`.`,
					),
				);
				return;
			}
		}

		if (ids.includes(agentId)) {
			console.log(colors.dim(`  agent-ids already contains ${agentId}, skipping index update`));
		} else {
			if (useLedger) {
				console.log(
					colors.yellow("Please confirm the second transaction on your Ledger device..."),
				);
			}
			startSpinner("Updating agent-ids index...");
			const idsTxHash = await setTextRecordOnChain(
				node,
				"agent-ids",
				JSON.stringify([...ids, agentId]),
				resolver,
				ensNetwork,
				useLedger,
				accountIndex,
			);
			const idsReceipt = await client.waitForTransactionReceipt({
				hash: idsTxHash,
				confirmations: 2,
			});
			stopSpinner();

			if (idsReceipt.status !== "success") {
				console.error(
					colors.red(
						`✗ agent-ids update reverted. ENSIP-25 record is set but the resolver won't discover it until you re-run \`ensemble agent link\` or write agent-ids manually.`,
					),
				);
				return;
			}

			console.log(colors.green(`✓ agent-ids updated`));
			console.log(`  ${colors.blue("Explorer:")} ${config.explorerUrl}/tx/${idsTxHash}`);
		}

		console.log(colors.green(`✓ Agent #${agentId} linked to ${fullName}`));
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

		const [tokenURI, owner, binding] = await Promise.all([
			getAgentTokenURI(agentChain, agentId),
			getAgentOwner(agentChain, agentId),
			getAdapterBinding(agentChain, agentId),
		]);

		stopSpinner();

		console.log(colors.green(`✓ Agent #${agentId}`));
		console.log(`  ${colors.blue("Owner:")} ${owner}`);
		console.log(`  ${colors.blue("Registry:")} ${agentChain.identityRegistry8004}`);
		console.log(`  ${colors.blue("Chain ID:")} ${agentChain.chainId}`);
		if (binding) {
			const standard =
				ADAPTER_TOKEN_STANDARD_NAMES[binding.standard] ?? `standard ${binding.standard}`;
			console.log(
				`  ${colors.blue("Binding:")} ${standard} token ${binding.tokenContract} #${binding.tokenId}`,
			);
			console.log(
				colors.dim(
					`    via Adapter8004 ${agentChain.adapter8004} — holder of this token controls the agent`,
				),
			);
		}

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

		// ENSIP-25 linkage check
		const ensip25Key = buildEnsip25Key(agentChain.chainId, agentChain.identityRegistry8004, agentId);
		console.log();
		console.log(`  ${colors.blue("ENSIP-25 key:")} ${colors.dim(ensip25Key)}`);

		// Personhood check. For adapter-managed agents the registry owner is
		// the adapter contract itself — the AgentBook binding lives on the
		// human who holds the bound token (the wrapped name's holder), so
		// follow the binding to them. Non-adapter agents keep the owner check.
		let personhoodTarget = owner;
		if (binding) {
			const holder = await getBindingTokenHolder(
				agentChain,
				binding.tokenContract,
				binding.tokenId,
			);
			if (holder) personhoodTarget = holder;
		}
		startSpinner("Checking personhood...");
		const personhood = await resolvePersonhood(personhoodTarget, {
			networks: ["base", "world"],
		});
		stopSpinner();

		if (personhood.verified) {
			console.log(`  ${colors.green("✓")} ${colors.blue("Personhood:")} World ID verified`);
			console.log(`    ${colors.dim(`Nullifier: ${personhood.nullifierHash?.slice(0, 16)}...`)}`);
			console.log(`    ${colors.dim(`Network: ${personhood.network}`)}`);
		} else {
			console.log(`  ${colors.red("✗")} ${colors.blue("Personhood:")} not registered in AgentBook`);
		}
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
