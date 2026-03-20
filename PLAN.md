# Trust Resolution Layer — Build Plan

Session handoff document. Start here.

---

## Context Files

Read these first to rebuild context:
- `ONE-PAGER.md` — project pitch, architecture, deliverables
- `PRD.md` — full product requirements, TrustProfile interface, resolution steps
- `README.md` — hackathon registration details, API keys, wallet, token ID
- `context.md` — SKILL.md / DVS trust hierarchy (Resolution Layer 4)
- `spec/aip-draft.md` — AIP spec (Resolution Layer 3)

External specs:
- ENSIP-25: https://github.com/ensdomains/ensips/blob/master/ensips/25.md
- ENSIP-26: https://github.com/ensdomains/ensips/pull/65
- ERC-8004: https://eips.ethereum.org/EIPS/eip-8004
- Worldcoin AgentKit: https://github.com/worldcoin/agentkit — Resolution Layer 0 analog (see below)

---

## Product Vision — What the Finished Thing Looks Like

When everything in ARCHITECTURE.md is built out, there are **three surfaces** a user (human or agent) interacts with:

### 1. The CLI (`ensemble`)

The command-line tool for *writing* identity infrastructure and *reading* trust profiles:

```bash
# The headline command — resolve any ENS name through all 5 trust layers
ensemble trust estmcmxci.eth
# → Personhood: ✓ (World ID, nullifier: 0x3a...)
# → Identity:   ✓ (ERC-8004 #24994, Base)
# → Context:    ✓ (ENSIP-26, SKILL.md at skills.estmcmxci.eth)
# → Manifest:   ✓ (AIP v1, signature valid, lineage depth: 1)
# → Skill:      ✓ (domain-verified, served from estmcmxci.eth)
# → Trust Tier: full

# Set all the records needed to become "full" trust
ensemble agent register estmcmxci.eth --link --chain base
ensemble edit txt estmcmxci.eth agent-context '{"skill":"https://skills.estmcmxci.eth/skill.md"}'
ensemble manifest create --sign --pin  # → ipfs://Qm...
ensemble edit txt v1.estmcmxci.eth agent-manifest ipfs://Qm...
```

### 2. The Site (`estmcmxci.eth` / Vercel)

The web UI that makes the TRL tangible:

- `/` — Landing page, the thesis of deliberate legibility
- `/essay` — "The Abstracted Self" (the intellectual foundation)
- `/resolve` — Interactive TRL demo: type any ENS name, see all 5 layers resolve in real time
- `/trust` — estmcmxci.eth's own live trust profile (the reference implementation *is* the demo)
- `/token` — $ESTMCMXCI token profile (live price, trust profile, trading link, fee earnings)
- `/wallet` — Create a passkey-owned Safe, issue session keys scoped by trust tier

### 3. The Library (`@synthesis/resolver`)

The programmatic primitive that agents import:

```typescript
import { resolve } from '@synthesis/resolver'
const profile = await resolve('estmcmxci.eth')
// profile.trustScore === 'full'
// profile.personhood.verified === true
// profile.identity.agentId === '24994'
// ...
```

---

## CLI Gap Analysis — New Commands & Extensions

### New commands

| Command | Layer | What it does |
|---------|-------|-------------|
| `ensemble trust <name>` | All | Flagship — runs full TRL resolution through all 5 layers, displays pass/fail per layer with trust tier |
| `ensemble manifest create` | 3 (AIP) | Create an AIP manifest JSON, sign it with the ENS owner key (EIP-191 or EIP-712), output the signed manifest |
| `ensemble manifest pin` | 3 (AIP) | Pin a manifest to IPFS (Pinata/web3.storage), return the CID |
| `ensemble manifest verify <name>` | 3 (AIP) | Fetch the manifest for an ENS name, verify signature matches current owner, walk the `prev` lineage chain |
| `ensemble context set <name>` | 2 (ENSIP-26) | Set the `agent-context` text record with structured content (JSON with skill URL, endpoints, capabilities) |
| `ensemble context get <name>` | 2 (ENSIP-26) | Read and parse the `agent-context` record |
| `ensemble skill fetch <url>` | 4 (DVS) | Fetch a SKILL.md from a URL, verify domain ownership against ENS |
| `ensemble personhood check <address>` | 0 (World ID) | Query AgentBook on Base/World Chain — is this address backed by a verified human? |
| `ensemble personhood register` | 0 (World ID) | Register the agent wallet in AgentBook via AgentKit (requires World ID verification flow) |
| `ensemble deploy` | Hosting | Build static site, pin to IPFS, propose ENS content hash update (wraps OmniPin) |
| `ensemble launch <name>` | Product | **The ceremony.** Verifies TRL === full, site is live (contenthash set + gateway responding), caller owns name, then deploys $TOKEN via Bankr → Clanker. Writes token contract address back to ENS text record. One-time, irreversible. |

### Extensions to existing commands

| Existing command | What changes |
|-----------------|-------------|
| `agent info` | Currently only reads ERC-8004 metadata. Should also check ENSIP-25 linkage, show trust tier, and cross-reference AgentBook personhood status |
| `agent register` | Add `--personhood` flag to also register in AgentBook in one flow |
| `resolve` | Stays as the low-level ENS tool (address, text records, contenthash). `trust` supersedes it for TRL use cases |
| `profile` | Incorporate trust tier alongside the existing ENS profile data |

### New dependencies (installed)

| Package | Location | Purpose |
|---------|----------|---------|
| `viem` | resolver, cli | ENS resolution, contract reads, EIP-191 signing — covers all ENS needs natively |
| `zod` | resolver, cli | TrustProfile schema, TrustTier enum, runtime validation |
| `pinata` | resolver, cli | IPFS pinning for manifests and static content |
| `@worldcoin/agentkit` | resolver | AgentBook on-chain lookup, World ID verification flow |
| `@zerodev/sdk` + `@zerodev/permissions` + `permissionless` | resolver | Wallet stretch goal — session keys, smart accounts |
| `omnipin` | root devDep | IPFS pin + ENS contenthash + Safe multisig proposal |
| `next` + `react` + `tailwindcss` + `@mdx-js/react` | site | Application layer |
| Bankr Agent API | REST (no SDK) | Crypto execution — token deployment (Clanker), fee claiming, swaps, transfers |

### Bankr as crypto execution layer

Bankr CLI / API handles all routine crypto operations — token deployment (Clanker), fee claiming, swaps, transfers, balance queries. This eliminates the need for custom Clanker SDK integration or direct contract interaction code. Both the CLI and site delegate to Bankr for execution.

| Operation | Via Bankr |
|-----------|-----------|
| Deploy $ESTMCMXCI | Bankr → Clanker factory on Base (one-time) |
| Claim trading fees | Bankr → claim accumulated WETH + token |
| USDC transfers | Bankr → direct transfer or x402 payment |
| Token swaps | Bankr → Uniswap routing |
| Balance queries | Bankr → multi-chain portfolio |

### What stays out of the CLI

The **wallet layer** (Safe + passkeys + session keys) and the **spending layer** (agent card + x402) are web-first experiences — they require browser-based passkey auth, wallet connect, and interactive UIs. These belong on the site, not in the CLI. The **identity token** deployment is a one-time event executed via Bankr, not a recurring CLI workflow. The CLI's job is to be the *infrastructure tool* — set records, sign manifests, verify trust, pin content.

---

## Scaffolding Plan

```
synthesis/
  package.json                 # (exists) pnpm workspace root
  pnpm-workspace.yaml          # (exists) packages/*
  pnpm-lock.yaml               # (exists) lockfile
  README.md                    # (exists) registration + API info
  ONE-PAGER.md                 # (exists) project pitch
  PRD.md                       # (exists) product requirements
  PLAN.md                      # (exists) this file
  ARCHITECTURE.md              # (exists) how all layers compose
  WORKFLOW.md                  # (exists) Linear → branch → PR → merge flow
  context.md                   # (exists) SKILL.md value prop
  packages/
    resolver/                  # @synthesis/resolver — the core library
      package.json             # (exists) viem, zod, pinata, @worldcoin/agentkit, @zerodev/*
      tsconfig.json            # (exists)
      src/
        index.ts               # (exists) main export
        schema.ts              # (exists) TrustProfile, TrustTier Zod schemas
        layers/
          personhood.ts        # Resolution Layer 0: World ID proof-of-personhood (via AgentKit)
          identity.ts          # Resolution Layer 1: ENSIP-25 resolution
          context.ts           # Resolution Layer 2: ENSIP-26 resolution
          manifest.ts          # Resolution Layer 3: AIP manifest fetch + signature verification
          skill.ts             # Resolution Layer 4: SKILL.md fetch + domain verification
        utils/
          ens.ts               # ENS name normalization, text record helpers
          ipfs.ts              # IPFS gateway fetch + pinning (Pinata)
          erc7930.ts           # ERC-7930 address encoding/decoding
          signature.ts         # EIP-191/EIP-712 sign + verify helpers (via viem)
    cli/                       # (exists) @synthesis/cli — Ensemble CLI
      package.json             # (exists) viem, zod, pinata, incur, @synthesis/resolver
      index.ts                 # (exists) CLI entry point, command registration
      commands/
        index.ts               # (exists) command re-exports
        resolve.ts             # (exists) ENS name ↔ address resolution
        profile.ts             # (exists) full ENS profile display
        available.ts           # (exists) name availability check
        register.ts            # (exists) ENS name registration
        renew.ts               # (exists) name renewal
        transfer.ts            # (exists) name transfer
        list.ts                # (exists) list names by address
        edit.ts                # (exists) set text/address/primary records
        verify.ts              # (exists) verify ENS records
        name.ts                # (exists) name a smart contract
        agent.ts               # (exists) ERC-8004 register, link, info
        utils.ts               # (exists) namehash, labelhash, resolver, deployments
        trust.ts               # NEW — full TRL resolution (all 5 layers)
        manifest.ts            # NEW — create, pin, verify AIP manifests
        context.ts             # NEW — get/set ENSIP-26 agent-context
        skill.ts               # NEW — fetch SKILL.md, verify domain ownership
        personhood.ts          # NEW — AgentBook lookup + registration
        deploy.ts              # NEW — IPFS pin + ENS content hash update
        launch.ts              # NEW — the ceremony: TRL full + site live + deploy token via Bankr
      config/
        deployments.ts         # (exists) network configs + contract addresses
      utils/
        contracts.ts           # (exists) contract ABIs + helpers
        viem.ts                # (exists) client factories
        erc7930.ts             # (exists) ENSIP-25 key construction
        ensip5.ts              # (exists) ENSIP-5 helpers
        ensnode.ts             # (exists) ENSNode API client
        ledger.ts              # (exists) Ledger hardware wallet support
        node.ts                # (exists) node utilities
        spinner.ts             # (exists) CLI spinner
        types.ts               # (exists) shared types
        avatar.ts              # (exists) avatar resolution
        index.ts               # (exists) utility re-exports
        agentbook.ts           # NEW — World ID AgentBook contract reads
        ipfs.ts                # NEW — IPFS pin + fetch (shared with resolver)
        manifest.ts            # NEW — AIP manifest sign/verify helpers
    site/                      # @synthesis/site — Next.js personal site (estmcmxci.eth)
      package.json             # (exists) next 15, react 19, tailwind 4, @mdx-js/react, @synthesis/resolver
      next.config.ts           # (exists) MDX plugin
      tsconfig.json            # (exists)
      postcss.config.mjs       # (exists) @tailwindcss/postcss
      src/
        app/
          layout.tsx           # (exists) root layout
          page.tsx             # (exists) / — landing, thesis of deliberate legibility
          globals.css          # (exists) tailwind import
          essay/page.tsx       # /essay — "The Abstracted Self"
          resolve/page.tsx     # /resolve — interactive TRL demo
          trust/page.tsx       # /trust — live trust profile for estmcmxci.eth
          token/page.tsx       # /token — $ESTMCMXCI profile (price, trust, trading, fees)
          wallet/page.tsx      # /wallet — passkey Safe creation + session keys
          skill.md/route.ts    # /skill.md — machine-readable capability file
        mdx-components.tsx     # (exists) MDX component overrides
        components/
          trust-profile.tsx    # TRL result visualization
          layer-badge.tsx      # per-layer pass/fail indicator
          lineage-chain.tsx    # AIP version lineage visualization
  scripts/
    set-records.sh             # Set all ENS records for estmcmxci.eth
    publish-manifest.sh        # Create + sign + pin AIP manifest to IPFS
  spec/
    aip-draft.md               # (exists) Agent Identity Profile spec (Resolution Layer 3)
    agent-skill-8004-25.md     # (exists) Celonames reference — ENSIP-25 + ERC-8004 on Celo
    test-vectors.json          # Known-good resolution results for testing
```

## Build Sequence

> Phase numbering matches ARCHITECTURE.md, Linear epics, and the [tracking spreadsheet](https://docs.google.com/spreadsheets/d/1SsP_h1_CaMOmnEI_I_mOpg5o4N_rxr8ABVv2tFKSnwg/edit?gid=926803338#gid=926803338).

### Phase 0: Personhood — World ID + AgentKit

Linear epic: SYN-5

- [ ] `layers/personhood.ts` — Resolution Layer 0: World ID proof-of-personhood
  - Integrate `@worldcoin/agentkit` for on-chain AgentBook lookup
  - `lookupHuman(address)` on AgentBook contract → nullifier hash (anonymous human ID)
  - AgentBook addresses: Base mainnet `0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4`, World Chain `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`
  - Answers: "is a real human behind this agent?" (boolean + nullifier)
  - AgentKit gives you a boolean. Synthesis gives you a gradient.
- [ ] `ensemble personhood check <address>` — CLI command for AgentBook lookup
- [ ] `ensemble personhood register` — register in AgentBook (human task — needs biometric)
- [ ] Register estmcmxci.eth agent wallet in AgentBook via AgentKit CLI

### Phase 1: Substrate — TRL Resolver Library (critical path, due Mar 25)

Linear epic: SYN-6 · GitHub milestone: Phase 1: Substrate

**Scaffold + types (done):**
- [x] Initialize pnpm workspace monorepo
- [x] Scaffold `packages/resolver/` with TypeScript + viem + zod
- [x] Define types: TrustProfile, TrustTier (Zod schemas in `schema.ts`)

**Utils:**
- [ ] Implement `utils/ens.ts` — text record reading, name normalization (viem `getEnsText`, `normalize`)
- [ ] Implement `utils/erc7930.ts` — address encoding for ENSIP-25 key construction
- [ ] Implement `utils/ipfs.ts` — IPFS gateway fetch + Pinata pinning

**Resolution layers:**
- [ ] `layers/identity.ts` — Resolution Layer 1: ENSIP-25 resolution
  - Construct `agent-registration[registry][agentId]` key
  - Query ENS text record
  - Verify against ERC-8004 contract (tokenURI, ownerOf)
  - Known registries: Base mainnet `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- [ ] `layers/context.ts` — Resolution Layer 2: ENSIP-26 resolution
  - Read `agent-context` text record, parse structured content, extract SKILL.md URL
- [ ] `layers/manifest.ts` — Resolution Layer 3: AIP manifest
  - Read `agent-latest` and `agent-version-lineage` from root name
  - Resolve manifest ref (subname mode: read `agent-manifest` from `<version>.<name>`)
  - Fetch manifest bytes from IPFS, verify signature against ENS owner
  - Walk `prev` chain for lineage
- [ ] `layers/skill.ts` — Resolution Layer 4: DVS resolution
  - Fetch SKILL.md from URL in agent-context, verify domain ownership

**Compose + CLI:**
- [ ] `src/index.ts` — compose all layers into `resolve(ensName): Promise<TrustProfile>`
- [ ] `ensemble trust <name>` — flagship CLI command (full TRL resolution)
- [ ] `ensemble manifest create/pin/verify` — AIP manifest lifecycle commands
- [ ] `ensemble context set/get` — ENSIP-26 agent-context commands
- [ ] `ensemble skill fetch` — DVS fetch + domain verification
- [ ] Extend `agent info` with ENSIP-25 linkage + trust tier display

### Phase 2: Application — Personal Site (due Mar 28)

Linear epic: SYN-7 · GitHub milestone: Phase 2: Application

- [x] Scaffold Next.js 15 site (`packages/site/`) with Tailwind 4 + MDX
- [ ] Build landing page (`/`) — identity + thesis of deliberate legibility
- [ ] Publish "The Abstracted Self" as site content (`/essay`)
- [ ] Build interactive TRL resolver (`/resolve`) — type any ENS name, see all 5 layers
- [ ] Build live trust profile page (`/trust`) — estmcmxci.eth's own profile
- [ ] Build token profile page (`/token`) — $ESTMCMXCI price, trust, trading, fees
- [ ] Add machine-readable layer (JSON-LD, SKILL.md route, OG tags)

### Phase 3: Hosting — Dweb Deployment (due Mar 29)

Linear epic: SYN-8 · GitHub milestone: Phase 3: Hosting

- [ ] Set up IPFS pinning (Pinata)
- [ ] Build `ensemble deploy` CLI command (wraps OmniPin)
- [ ] Set ENS records on estmcmxci.eth (ENSIP-25/26, AIP)
  - Set ENSIP-25 record for Token #24994
  - Set ENSIP-26 `agent-context`
  - Set AIP records: `agent-latest`, `agent-version-lineage`
  - Create `v1.estmcmxci.eth` subname, set `agent-manifest`
- [ ] Create + sign + pin AIP v1 manifest to IPFS
- [ ] Host SKILL.md on ENS subdomain (skills.estmcmxci.eth via eth.limo)
- [ ] Verify site at estmcmxci.eth.limo

### Phase 4: Launch Ceremony (due Mar 31)

Linear epic: SYN-9 · GitHub milestone: Phase 4: Launch Ceremony

- [ ] Build `ensemble launch <name>` CLI command — the ceremony
- [ ] Pin $ESTMCMXCI token image + metadata to IPFS
- [ ] Execute launch ceremony — deploy $ESTMCMXCI on Base via Bankr → Clanker
  - Verifies TRL === full (all 5 layers pass)
  - Verifies site is live (contenthash set, gateway responding)
  - Confirms caller owns the ENS name
  - Deploys via Bankr → Clanker factory on Base
  - Writes token contract address to ENS text record (`identity-token`)
- [ ] Verify token is tradeable on Uniswap
- [ ] Create agent.json + agent_log.json (DevSpot track requirement)
- [ ] Record demo video + write conversationLog
- [ ] Push code to public GitHub repo
- [ ] Publish project on hackathon platform (synthesis.devfolio.co)

### Phase 5: Wallet (post-hackathon stretch goal)

Linear epic: SYN-10

- [ ] Deploy Safe on Base with WebAuthn passkey owner (ZeroDev)
- [ ] Enable SmartSession module + policy contracts
- [ ] Session key creation UI (passkey auth → configure → issue)
- [ ] Wire session policies to TRL trust tiers

### Phase 6: Spending (post-hackathon)

Linear epic: SYN-11

- [ ] x402 payment flow with TRL verification on both sides
- [ ] Evaluate card issuers (Immersve, Lithic + Bridge)
- [ ] Trust-tier-scoped spend limits

## Key Decisions (resolved)

1. **viem** over ethers — lighter, native ENS support, already installed
2. **pnpm workspaces** — simple, no turbo needed for 3 packages
3. **Pinata** for IPFS pinning — SDK installed, JWT auth
4. **EIP-191** for manifest signing — viem `signMessage` / `verifyMessage`
5. **OmniPin** for hosting pipeline — IPFS pin + ENS contenthash + Safe multisig
6. **Bankr REST API** for crypto execution — no npm SDK, MCP tools for CLI
7. **ZeroDev** over Safe + Rhinestone for wallet — simpler DX, built-in session serialization (stretch goal)

## Borrowed Patterns from AgentKit

- **Gasless relay** — AgentKit sponsors Base registration gas via relay. Apply same pattern to ERC-8004 registration for lower friction.
- **x402 hooks** — AgentKit is built as an x402 extension (402 challenge → signature → on-chain lookup → access policy). Use as the access-control layer that *consumes* TrustProfiles. See `X402-DEMO-HOOK.md` for the full TRL + x402 composition spec.
- **CAIP-122 challenge flow** — chain-agnostic request-time verification. Compatible with our ENSIP-25 identity layer.
- **SKILL.md pattern** — AgentKit ships `skills/` folders with LLM-readable instruction files, directly validating our DVS/SKILL.md approach.

## Risks

- **ENS record gas costs** — setting multiple text records on mainnet. Batch if possible.
- **Subname creation** — `v1.estmcmxci.eth` requires either owning the name with a resolver that supports subnames, or using a service like NameWrapper.
- **IPFS gateway reliability** — have fallback gateways configured.
- **AgentKit stability** — v0.1.5 (pre-1.0, proprietary license). Fallback: call AgentBook contract directly via viem `readContract()`.
- **Timeline** — hackathon deadline Mar 31. Phase 1 (Substrate) due Mar 25, Phase 2 (Application) due Mar 28, Phase 3 (Hosting) due Mar 29.
