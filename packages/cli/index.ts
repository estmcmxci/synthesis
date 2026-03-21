#!/usr/bin/env -S node --no-deprecation
import "dotenv/config";
/**
 * Ensemble CLI
 *
 * A CLI for managing ENS names and agent identities on Ethereum.
 * Built with incur — works for both AI agents and humans.
 */

import { Cli, z } from "incur";
import {
	resolve as resolveCmd,
	profile as profileCmd,
	available as availableCmd,
	register as registerCmd,
	list as listCmd,
	verify as verifyCmd,
	setTxt as setTxtCmd,
	setAddress as setAddressCmd,
	setPrimary as setPrimaryCmd,
	getNamehash,
	getLabelHash,
	getResolverAddress,
	getDeployments,
	nameContract as nameContractCmd,
	renew as renewCmd,
	transfer as transferCmd,
	registerAgent,
	linkAgent,
	agentInfo,
	personhoodCheck,
	personhoodRegister,
	trust as trustCmd,
} from "./commands";
import { stopSpinner } from "./utils/spinner";

// =============================================================================
// CLI Setup
// =============================================================================

const cli = Cli.create("ensemble", {
	version: "0.1.0",
	description: `Ensemble CLI — manage ENS names and agent identities on Ethereum.

Environment Variables:
  ENS_PRIVATE_KEY  - Private key for write operations
  ETH_RPC_URL      - Custom RPC URL (default: https://sepolia.drpc.org)
  ENS_NETWORK      - Network to use (mainnet, sepolia)`,
	sync: {
		suggestions: [
			"resolve vitalik.eth",
			"check if myname.eth is available",
			"show profile for vitalik.eth",
			"list all ENS names owned by an address",
		],
	},
});

// Cleanup middleware for spinner
cli.use(async (_c, next) => {
	try {
		await next();
	} finally {
		try {
			stopSpinner();
		} catch {
			// Ignore errors during cleanup
		}
	}
});

// =============================================================================
// Trust Resolution
// =============================================================================

cli.command("trust", {
	description:
		"Resolve an ENS name through all 5 trust layers and display the trust profile",
	args: z.object({
		name: z.string().describe("ENS name to resolve (e.g., emilemarcelagustin.eth)"),
	}),
	options: z.object({
		agentId: z
			.array(z.string())
			.optional()
			.describe("Known agent IDs to scan for ENSIP-25 records (can repeat)"),
	}),
	alias: { agentId: "a" },
	examples: [
		{
			args: { name: "emilemarcelagustin.eth" },
			description: "Full trust resolution",
		},
		{
			args: { name: "emilemarcelagustin.eth" },
			options: { agentId: ["24994"] },
			description: "Resolve with known agent ID",
		},
	],
	async run({ args, options }) {
		await trustCmd({
			name: args.name,
			agentIds: options.agentId,
		});
		return { resolved: args.name };
	},
});

// =============================================================================
// Read Commands
// =============================================================================

cli.command("resolve", {
	description: "Resolve an ENS name to an address or vice versa",
	args: z.object({
		input: z.string().describe("ENS name or address to resolve"),
	}),
	options: z.object({
		txt: z.string().optional().describe("Query a specific text record"),
		contenthash: z.boolean().optional().describe("Fetch the content hash"),
		resolver: z.string().optional().describe("Specify a custom resolver address"),
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
	}),
	alias: { txt: "t", contenthash: "c", resolver: "r", network: "n" },
	examples: [
		{ args: { input: "vitalik.eth" }, description: "Resolve a name to address" },
		{ args: { input: "vitalik.eth" }, options: { txt: "com.twitter" }, description: "Query a text record" },
		{ args: { input: "vitalik.eth" }, options: { contenthash: true }, description: "Fetch content hash" },
	],
	async run({ args, options }) {
		await resolveCmd({
			input: args.input,
			txt: options.txt,
			contenthash: options.contenthash ?? false,
			resolverAddress: options.resolver,
			network: options.network,
		});
		return { resolved: args.input };
	},
});

cli.command("profile", {
	description: "Display a complete profile for an ENS name",
	args: z.object({
		input: z.string().describe("ENS name or address to query"),
	}),
	options: z.object({
		resolver: z.string().optional().describe("Specify a custom resolver address"),
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
	}),
	alias: { resolver: "r", network: "n" },
	examples: [
		{ args: { input: "vitalik.eth" }, description: "Show full ENS profile" },
	],
	async run({ args, options }) {
		await profileCmd({
			input: args.input,
			resolverAddress: options.resolver,
			network: options.network,
		});
		return { profiled: args.input };
	},
});

cli.command("available", {
	description: "Check if an ENS name is available for registration",
	args: z.object({
		name: z.string().describe("ENS name to check"),
	}),
	options: z.object({
		noPrice: z.boolean().optional().describe("Skip showing registration price"),
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
	}),
	alias: { network: "n" },
	examples: [
		{ args: { name: "myname" }, description: "Check if myname.eth is available" },
	],
	async run({ args, options }) {
		await availableCmd({
			name: args.name,
			showPrice: !options.noPrice,
			network: options.network,
		});
		return { checked: args.name };
	},
});

cli.command("list", {
	description: "List all ENS names owned by an address",
	args: z.object({
		address: z.string().describe("Address to query"),
	}),
	options: z.object({
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
	}),
	alias: { network: "n" },
	examples: [
		{ args: { address: "0x1234..." }, description: "List names owned by address" },
	],
	async run({ args, options }) {
		await listCmd({
			address: args.address,
			network: options.network,
		});
		return { listed: args.address };
	},
});

// =============================================================================
// Write Commands
// =============================================================================

cli.command("register", {
	description: "Register a new ENS name (commit-reveal process)",
	args: z.object({
		name: z.string().describe("ENS name to register (without .eth)"),
	}),
	options: z.object({
		owner: z.string().optional().describe("Owner address (defaults to signer from ENS_PRIVATE_KEY)"),
		address: z.string().optional().describe("Address record to set (defaults to owner)"),
		duration: z.string().optional().describe("Registration duration (e.g., 1y, 6m, 30d). Default: 1y"),
		txt: z.array(z.string()).optional().describe("Text record (format: key=value). Can be repeated."),
		primary: z.boolean().optional().describe("Set as primary name for owner"),
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
		ledger: z.boolean().optional().describe("Use Ledger hardware wallet for signing"),
		accountIndex: z.string().optional().describe("Ledger account index (default: 0)"),
	}),
	alias: { owner: "o", address: "a", duration: "d", txt: "t", primary: "p", network: "n", ledger: "l" },
	examples: [
		{ args: { name: "myname" }, description: "Register myname.eth" },
		{ args: { name: "myname" }, options: { owner: "0x1234...", duration: "2y" }, description: "Register with custom owner and duration" },
	],
	async run({ args, options }) {
		await registerCmd({
			name: args.name,
			owner: options.owner,
			address: options.address,
			duration: options.duration,
			txt: options.txt,
			primary: options.primary ?? false,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex ? parseInt(options.accountIndex, 10) : 0,
		});
		return { registered: args.name };
	},
});

cli.command("renew", {
	description: "Renew an existing ENS name registration",
	args: z.object({
		name: z.string().describe("ENS name to renew"),
	}),
	options: z.object({
		duration: z.string().optional().describe("Renewal duration (e.g., 1y, 6m, 30d). Default: 1y"),
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
		ledger: z.boolean().optional().describe("Use Ledger hardware wallet for signing"),
		accountIndex: z.string().optional().describe("Ledger account index (default: 0)"),
	}),
	alias: { duration: "d", network: "n", ledger: "l" },
	async run({ args, options }) {
		await renewCmd({
			name: args.name,
			duration: options.duration,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex ? parseInt(options.accountIndex, 10) : 0,
		});
		return { renewed: args.name };
	},
});

cli.command("transfer", {
	description: "Transfer ownership of an ENS name",
	args: z.object({
		name: z.string().describe("ENS name to transfer"),
		to: z.string().describe("Recipient address"),
	}),
	options: z.object({
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
		ledger: z.boolean().optional().describe("Use Ledger hardware wallet for signing"),
		accountIndex: z.string().optional().describe("Ledger account index (default: 0)"),
	}),
	alias: { network: "n", ledger: "l" },
	async run({ args, options }) {
		await transferCmd({
			name: args.name,
			to: args.to,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex ? parseInt(options.accountIndex, 10) : 0,
		});
		return { transferred: args.name, to: args.to };
	},
});

cli.command("verify", {
	description: "Verify that records are correctly set for an ENS name",
	args: z.object({
		name: z.string().describe("ENS name to verify"),
	}),
	options: z.object({
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
	}),
	alias: { network: "n" },
	async run({ args, options }) {
		await verifyCmd({
			name: args.name,
			network: options.network,
		});
		return { verified: args.name };
	},
});

cli.command("name", {
	description: "Assign an ENS name to a smart contract",
	args: z.object({
		contractAddress: z.string().describe("Contract address to name"),
		name: z.string().describe("Name label (without parent domain)"),
	}),
	options: z.object({
		parent: z.string().optional().describe("Parent domain (defaults to eth)"),
		noReverse: z.boolean().optional().describe("Skip reverse resolution"),
		checkCompatibility: z.boolean().optional().describe("Check if contract supports reverse resolution"),
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
		ledger: z.boolean().optional().describe("Use Ledger hardware wallet for signing"),
		accountIndex: z.string().optional().describe("Ledger account index (default: 0)"),
	}),
	alias: { parent: "p", network: "n", ledger: "l" },
	async run({ args, options }) {
		await nameContractCmd({
			contractAddress: args.contractAddress,
			name: args.name,
			parent: options.parent,
			noReverse: options.noReverse,
			checkCompatibility: options.checkCompatibility,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex ? parseInt(options.accountIndex, 10) : 0,
		});
		return { named: args.contractAddress, as: args.name };
	},
});

// =============================================================================
// Edit Subcommand Group
// =============================================================================

const edit = Cli.create("edit", { description: "Edit records for an ENS name" });

edit.command("txt", {
	description: "Set or clear a text record (use 'null' to clear)",
	args: z.object({
		name: z.string().describe("Target ENS name"),
		key: z.string().describe("Text record key (e.g., com.github, description)"),
		value: z.string().describe("Value to set (use 'null' to clear)"),
	}),
	options: z.object({
		resolver: z.string().optional().describe("Resolver address (auto-detected if not provided)"),
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
		ledger: z.boolean().optional().describe("Use Ledger hardware wallet for signing"),
		accountIndex: z.string().optional().describe("Ledger account index (default: 0)"),
	}),
	alias: { resolver: "r", network: "n", ledger: "l" },
	examples: [
		{ args: { name: "myname.eth", key: "com.github", value: "myuser" }, description: "Set GitHub handle" },
		{ args: { name: "myname.eth", key: "description", value: "null" }, description: "Clear description" },
	],
	async run({ args, options }) {
		await setTxtCmd({
			name: args.name,
			key: args.key,
			value: args.value,
			resolverAddress: options.resolver,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex ? parseInt(options.accountIndex, 10) : 0,
		});
		return { name: args.name, key: args.key, value: args.value };
	},
});

edit.command("address", {
	description: "Set the address record for an ENS name",
	args: z.object({
		name: z.string().describe("Target ENS name"),
		value: z.string().describe("Address to set"),
	}),
	options: z.object({
		resolver: z.string().optional().describe("Resolver address (auto-detected if not provided)"),
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
		ledger: z.boolean().optional().describe("Use Ledger hardware wallet for signing"),
		accountIndex: z.string().optional().describe("Ledger account index (default: 0)"),
	}),
	alias: { resolver: "r", network: "n", ledger: "l" },
	async run({ args, options }) {
		await setAddressCmd({
			name: args.name,
			value: args.value,
			resolverAddress: options.resolver,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex ? parseInt(options.accountIndex, 10) : 0,
		});
		return { name: args.name, address: args.value };
	},
});

edit.command("primary", {
	description: "Set the primary name for your address (reverse record)",
	args: z.object({
		name: z.string().describe("ENS name to set as primary"),
	}),
	options: z.object({
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
		ledger: z.boolean().optional().describe("Use Ledger hardware wallet for signing"),
		accountIndex: z.string().optional().describe("Ledger account index (default: 0)"),
	}),
	alias: { network: "n", ledger: "l" },
	async run({ args, options }) {
		await setPrimaryCmd({
			name: args.name,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex ? parseInt(options.accountIndex, 10) : 0,
		});
		return { primary: args.name };
	},
});

// Mount edit subcommand group
cli.command(edit);

// =============================================================================
// Utility Commands
// =============================================================================

cli.command("namehash", {
	description: "Get the namehash for an ENS name",
	args: z.object({
		name: z.string().describe("Name to hash"),
	}),
	options: z.object({
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
	}),
	alias: { network: "n" },
	async run({ args, options }) {
		await getNamehash({ name: args.name, network: options.network });
		return { hashed: args.name };
	},
});

cli.command("labelhash", {
	description: "Get the labelhash for a single label",
	args: z.object({
		name: z.string().describe("Label to hash"),
	}),
	async run({ args }) {
		await getLabelHash({ name: args.name });
		return { hashed: args.name };
	},
});

cli.command("resolver", {
	description: "Get the resolver address for an ENS name",
	args: z.object({
		name: z.string().describe("Target ENS name"),
	}),
	options: z.object({
		network: z.string().optional().describe("Network to use (mainnet, sepolia)"),
	}),
	alias: { network: "n" },
	async run({ args, options }) {
		await getResolverAddress({ name: args.name, network: options.network });
		return { resolved: args.name };
	},
});

cli.command("deployments", {
	description: "Display ENS contract addresses",
	run() {
		getDeployments();
		return { displayed: true };
	},
});

// =============================================================================
// Agent Subcommand Group (ERC-8004 + ENSIP-25)
// =============================================================================

const agent = Cli.create("agent", {
	description: "Manage agent identities (ERC-8004 + ENSIP-25)",
});

agent.command("register", {
	description:
		"Register on ERC-8004 IdentityRegistry and optionally link to ENS name via ENSIP-25",
	args: z.object({
		name: z
			.string()
			.describe("ENS name to associate with the agent (e.g., estmcmxci.eth)"),
	}),
	options: z.object({
		chain: z
			.string()
			.optional()
			.describe(
				"Chain for ERC-8004 registry (base, eth, op, arb, sep). Default: base",
			),
		nameChain: z
			.string()
			.optional()
			.describe(
				"Chain where the ENS name lives, if different from registry chain",
			),
		mcp: z
			.string()
			.optional()
			.describe("MCP service endpoint to include in agent metadata"),
		http: z
			.string()
			.optional()
			.describe("HTTP service endpoint to include in agent metadata"),
		services: z
			.string()
			.optional()
			.describe("Additional services as JSON array"),
		link: z
			.boolean()
			.optional()
			.describe("Also set ENSIP-25 text record to link agent to ENS name"),
		network: z
			.string()
			.optional()
			.describe("Network override (mainnet, sepolia)"),
		ledger: z
			.boolean()
			.optional()
			.describe("Use Ledger hardware wallet for signing"),
		accountIndex: z
			.string()
			.optional()
			.describe("Ledger account index (default: 0)"),
	}),
	alias: { chain: "c", link: "l", network: "n" },
	examples: [
		{
			args: { name: "estmcmxci.eth" },
			options: { link: true },
			description: "Register agent and link to ENS name",
		},
		{
			args: { name: "myagent.eth" },
			options: { chain: "op", mcp: "https://mcp.example.com" },
			description: "Register on Optimism with MCP endpoint",
		},
	],
	async run({ args, options }) {
		await registerAgent({
			name: args.name,
			chain: options.chain,
			nameChain: options.nameChain,
			mcp: options.mcp,
			http: options.http,
			services: options.services,
			link: options.link,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex
				? parseInt(options.accountIndex, 10)
				: 0,
		});
		return { registered: args.name };
	},
});

agent.command("link", {
	description:
		"Link an existing ERC-8004 agent to an ENS name via ENSIP-25 text record",
	args: z.object({
		name: z.string().describe("ENS name to link"),
		agentId: z.string().describe("ERC-8004 agent token ID"),
	}),
	options: z.object({
		chain: z
			.string()
			.optional()
			.describe("Chain where ERC-8004 registry lives (default: base)"),
		nameChain: z
			.string()
			.optional()
			.describe("Chain where ENS name lives (default: mainnet)"),
		network: z.string().optional().describe("Network override"),
		ledger: z
			.boolean()
			.optional()
			.describe("Use Ledger hardware wallet"),
		accountIndex: z
			.string()
			.optional()
			.describe("Ledger account index (default: 0)"),
	}),
	alias: { chain: "c", network: "n" },
	examples: [
		{
			args: { name: "estmcmxci.eth", agentId: "24994" },
			description: "Link agent #24994 to estmcmxci.eth",
		},
	],
	async run({ args, options }) {
		await linkAgent({
			name: args.name,
			agentId: args.agentId,
			chain: options.chain,
			nameChain: options.nameChain,
			network: options.network,
			useLedger: options.ledger,
			accountIndex: options.accountIndex
				? parseInt(options.accountIndex, 10)
				: 0,
		});
		return { linked: args.name, agentId: args.agentId };
	},
});

agent.command("info", {
	description:
		"Look up an ERC-8004 agent's metadata, owner, and registration details",
	args: z.object({
		agentId: z.string().describe("ERC-8004 agent token ID"),
	}),
	options: z.object({
		chain: z
			.string()
			.optional()
			.describe("Chain to query (default: base)"),
	}),
	alias: { chain: "c" },
	examples: [
		{
			args: { agentId: "24994" },
			description: "Look up agent #24994 on Base",
		},
		{
			args: { agentId: "24994" },
			options: { chain: "eth" },
			description: "Look up agent on Ethereum mainnet",
		},
	],
	async run({ args, options }) {
		await agentInfo({ agentId: args.agentId, chain: options.chain });
		return { queried: args.agentId };
	},
});

cli.command(agent);

// =============================================================================
// Personhood Subcommand Group (World ID + AgentBook)
// =============================================================================

const personhood = Cli.create("personhood", {
	description: "World ID proof-of-personhood verification",
});

personhood.command("check", {
	description:
		"Check if an address is backed by a verified human in AgentBook",
	args: z.object({
		address: z.string().describe("Ethereum address to check"),
	}),
	options: z.object({
		network: z
			.string()
			.optional()
			.describe("AgentBook network: base (default), world, base-sepolia"),
	}),
	alias: { network: "n" },
	examples: [
		{
			args: { address: "0xeb0ABB367540f90B57b3d5719fd2b9c740a15022" },
			description: "Check personhood on Base + World Chain",
		},
		{
			args: { address: "0xeb0ABB367540f90B57b3d5719fd2b9c740a15022" },
			options: { network: "world" },
			description: "Check only on World Chain",
		},
	],
	async run({ args, options }) {
		await personhoodCheck({
			address: args.address,
			network: options.network,
		});
		return { checked: args.address };
	},
});

personhood.command("register", {
	description:
		"Register an address in AgentBook via World ID verification",
	args: z.object({
		address: z
			.string()
			.describe("Address to register (defaults to ENS_PRIVATE_KEY signer)"),
	}),
	options: z.object({
		network: z
			.string()
			.optional()
			.describe("Target network: base (default), world, base-sepolia"),
		manual: z
			.boolean()
			.optional()
			.describe("Print calldata instead of submitting via relay"),
	}),
	alias: { network: "n", manual: "m" },
	examples: [
		{
			args: { address: "0xeb0ABB367540f90B57b3d5719fd2b9c740a15022" },
			description: "Register on Base mainnet via relay",
		},
		{
			args: { address: "0xeb0ABB367540f90B57b3d5719fd2b9c740a15022" },
			options: { manual: true },
			description: "Print calldata for manual submission",
		},
	],
	async run({ args, options }) {
		await personhoodRegister({
			address: args.address,
			network: options.network,
			manual: options.manual,
		});
		return { registered: args.address };
	},
});

cli.command(personhood);

// =============================================================================
// Serve
// =============================================================================

cli.serve();

export default cli;
