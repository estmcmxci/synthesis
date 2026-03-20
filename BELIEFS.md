# Beliefs — Synthesis

Golden principles and invariants. If a rule isn't here, ask before assuming.

## Invariants

1. **CLI-first.** Every feature works as an `ensemble` CLI command before it gets
   a site route or UI surface. This forces clean separation and testability.

2. **ENS is root of trust.** An ENS name is the only input. Everything derives
   from on-chain records. No custodial identity, no email auth, no API keys as
   identity. If it's not resolvable from the name, it doesn't exist.

3. **Validate at the boundary.** Zod on every API route and CLI input. No `any`
   in core domain logic. Internal code trusts the validated types.

4. **Bankr for crypto execution.** Token deployment, fee claiming, swaps,
   transfers — all go through Bankr API. No custom contract interaction code
   for operations Bankr already handles.

5. **Resolution Layers are read-only.** The TRL resolver never writes. It reads
   ENS records, fetches IPFS, queries contracts. Record-setting is a separate
   concern handled by CLI commands.

6. **Plans before code.** Features and milestones get a plan file in `plans/`
   checked in before implementation starts.

## Tech Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ENS + contract reads | viem | Lighter than ethers, better ENS support, tree-shakeable |
| CLI framework | incur | Works for both AI agents and humans |
| Mainnet RPC | eth.drpc.org | llamarpc hangs, cloudflare-eth untested |
| Crypto execution | Bankr API | Already supports Clanker, Uniswap, transfers — no SDK to maintain |
| IPFS pinning | Pinata + web3.storage | Redundancy across two providers |
| Site framework | Next.js (App Router) | SSR for resolver, static export for dweb mirror |
| Package manager | pnpm | Workspaces support, fast, deterministic |

## Anti-patterns

- Hand-written contract ABIs that drift from the deployed contract
- Business logic in CLI command handlers (put it in service layer)
- UI components that call viem directly (go through service)
- Unvalidated ENS names crossing domain boundaries
- Storing private keys in code or config (use env vars or Ledger)
- Building custom integrations for things Bankr already does
