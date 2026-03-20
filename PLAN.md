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

### New dependencies

| Package | Purpose |
|---------|---------|
| `@worldcoin/agentkit` | AgentBook on-chain lookup, World ID verification flow |
| IPFS pinning client (Pinata SDK or web3.storage) | Pin manifests and static content |
| Signature utils (EIP-191/EIP-712 via viem) | Sign and verify AIP manifests — viem already supports this natively |
| Bankr Agent API | Crypto execution layer — token deployment (Clanker), fee claiming, swaps, transfers |

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
  README.md                    # (exists) registration + API info
  ONE-PAGER.md                 # (exists) project pitch
  PRD.md                       # (exists) product requirements
  PLAN.md                      # (exists) this file
  ARCHITECTURE.md              # (exists) how all layers compose
  context.md                   # (exists) SKILL.md value prop
  packages/
    resolver/                  # @synthesis/resolver — the core library
      package.json
      tsconfig.json
      src/
        index.ts               # main export: resolve(ensName) => TrustProfile
        types.ts               # TrustProfile, AgentManifest, TrustTier types
        layers/
          personhood.ts        # Resolution Layer 0: World ID proof-of-personhood (via AgentKit)
          identity.ts          # Resolution Layer 1: ENSIP-25 resolution
          context.ts           # Resolution Layer 2: ENSIP-26 resolution
          manifest.ts          # Resolution Layer 3: AIP manifest fetch + signature verification
          skill.ts             # Resolution Layer 4: SKILL.md fetch + domain verification
        utils/
          ens.ts               # ENS name normalization, text record helpers
          ipfs.ts              # IPFS gateway fetch + pinning (Pinata / web3.storage)
          erc7930.ts           # ERC-7930 address encoding/decoding
          signature.ts         # EIP-191/EIP-712 sign + verify helpers (via viem)
    cli/                       # (exists) @synthesis/cli — Ensemble CLI
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
    site/                      # Next.js personal site (estmcmxci.eth)
      package.json
      next.config.ts
      app/
        page.tsx               # / — landing, thesis of deliberate legibility
        essay/page.tsx         # /essay — "The Abstracted Self"
        resolve/page.tsx       # /resolve — interactive TRL demo
        trust/page.tsx         # /trust — live trust profile for estmcmxci.eth
        token/page.tsx         # /token — $ESTMCMXCI profile (price, trust, trading, fees)
        wallet/page.tsx        # /wallet — passkey Safe creation + session keys
        skill.md/route.ts      # /skill.md — machine-readable capability file
      components/
        trust-profile.tsx      # TRL result visualization
        layer-badge.tsx        # per-layer pass/fail indicator
        lineage-chain.tsx      # AIP version lineage visualization
  scripts/
    set-records.sh             # Set all ENS records for estmcmxci.eth
    publish-manifest.sh        # Create + sign + pin AIP manifest to IPFS
  spec/
    aip-draft.md               # (exists) Agent Identity Profile spec (Resolution Layer 3)
    agent-skill-8004-25.md     # (exists) Celonames reference — ENSIP-25 + ERC-8004 on Celo
    test-vectors.json          # Known-good resolution results for testing
```

## Build Sequence

### Phase 1: Foundation (do first)

- [ ] Initialize monorepo (pnpm workspace or simple npm workspaces)
- [ ] Scaffold `packages/resolver/` with TypeScript config
- [ ] Install dependencies: `viem` (for ENS + contract reads), `@ensdomains/ensjs` if needed
- [ ] Define types in `types.ts` (TrustProfile, AgentManifest, TrustTier)
- [ ] Implement `utils/ens.ts` — text record reading, name normalization
- [ ] Implement `utils/erc7930.ts` — address encoding for ENSIP-25 key construction
- [ ] Implement `utils/ipfs.ts` — fetch from IPFS gateway

### Phase 2: Resolution Layers (core work)

- [ ] `layers/personhood.ts` — Resolution Layer 0: World ID proof-of-personhood
  - Integrate `@worldcoin/agentkit` for on-chain AgentBook lookup
  - `lookupHuman(address)` on AgentBook contract → nullifier hash (anonymous human ID)
  - AgentBook addresses: Base mainnet `0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4`, World Chain `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`
  - Answers: "is a real human behind this agent?" (boolean + nullifier)
  - AgentKit gives you a boolean. Synthesis gives you a gradient.

- [ ] `layers/identity.ts` — Resolution Layer 1: ENSIP-25 resolution
  - Construct `agent-registration[registry][agentId]` key
  - Query ENS text record
  - Verify against ERC-8004 contract (tokenURI, ownerOf)
  - Known registries: Base mainnet `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`

- [ ] `layers/context.ts` — ENSIP-26 resolution
  - Read `agent-context` text record
  - Parse structured content (JSON/YAML/Markdown)
  - Extract SKILL.md URL if present

- [ ] `layers/manifest.ts` — AIP resolution
  - Read `agent-latest` and `agent-version-lineage` from root name
  - Resolve manifest ref (subname mode: read `agent-manifest` from `<version>.<name>`)
  - Fetch manifest bytes from IPFS
  - Verify signature against ENS owner
  - Walk `prev` chain for lineage

- [ ] `layers/skill.ts` — DVS resolution
  - Fetch SKILL.md from URL in agent-context
  - Verify domain ownership (ENS lookup on domain)

- [ ] `src/index.ts` — compose all layers into `resolve(ensName): Promise<TrustProfile>`

### Phase 3: Live Records (make it real)

- [ ] Set ENSIP-25 record on `estmcmxci.eth` for Token #24994
- [ ] Set ENSIP-26 `agent-context` on `estmcmxci.eth`
- [ ] Create v1 AIP manifest JSON, sign with ENS owner key
- [ ] Pin manifest to IPFS (via w3s.link / Pinata / nft.storage)
- [ ] Set AIP records: `agent-latest`, `agent-version-lineage` on root
- [ ] Create `v1.estmcmxci.eth` subname, set `agent-manifest` record
- [ ] Host SKILL.md on ENS subdomain (skills.estmcmxci.eth via eth.limo)

### Phase 4: Demo — estmcmxci.eth as Reference Implementation

The personal website (see `SITE.md`) *is* the reference implementation. Resolve estmcmxci.eth and what comes back is a human resolvable across all 5 layers — from biometric personhood down to skill provenance.

- [ ] Build CLI: `ensemble trust estmcmxci.eth` (full TRL resolution)
- [ ] Build site at estmcmxci.eth (Next.js on Vercel) with:
  - `/resolve` — interactive TRL demo, resolve any ENS name through all 5 layers
  - `/trust` — live-resolved trust profile for estmcmxci.eth
  - `/essay` — "The Abstracted Self" (the thesis: conscious legibility as inversion)
  - `/token` — $ESTMCMXCI token profile (price, trust, trading link, fee earnings)
- [ ] Register estmcmxci.eth agent wallet in AgentBook via AgentKit CLI (World ID verification)
- [ ] Deploy site to IPFS + set ENS contenthash (`ensemble deploy`)
- [ ] Visualize lineage chain (prev pointers)

### Phase 4.5: Launch Ceremony

The token deployment is the culmination — proof that the entire stack works.

- [ ] Pin token image + metadata to IPFS
- [ ] Run `ensemble launch estmcmxci.eth`
  - Verifies TRL === full (all 5 layers pass)
  - Verifies site is live (contenthash set, gateway responding)
  - Confirms caller owns the ENS name
  - Deploys $ESTMCMXCI via Bankr → Clanker on Base
  - Writes token contract address to ENS text record (`identity-token`)
- [ ] Verify token is tradeable on Uniswap
- [ ] Record demo video / conversation log for submission

### Phase 5: Submit

- [ ] Register project on synthesis.devfolio.co API (create team, create project)
- [ ] Push code to public GitHub repo
- [ ] Write conversationLog documenting human-agent collaboration
- [ ] Submit before deadline

## Key Decisions to Make Early

1. **viem vs ethers** — viem is lighter and has better ENS support. Recommend viem.
2. **Monorepo tool** — pnpm workspaces (simple, no turbo needed for 2 packages)
3. **IPFS pinning** — web3.storage (free, easy API) or Pinata
4. **Demo format** — CLI is faster to build, web UI is better for judges. Can do both.
5. **ENS record setting** — use `cast` (foundry) or ethers script. Need private key access.

## Borrowed Patterns from AgentKit

- **Gasless relay** — AgentKit sponsors Base registration gas via relay. Apply same pattern to ERC-8004 registration for lower friction.
- **x402 hooks** — AgentKit is built as an x402 extension (402 challenge → signature → on-chain lookup → access policy). Use as the access-control layer that *consumes* TrustProfiles. See `X402-DEMO-HOOK.md` for the full TRL + x402 composition spec.
- **CAIP-122 challenge flow** — chain-agnostic request-time verification. Compatible with our ENSIP-25 identity layer.
- **SKILL.md pattern** — AgentKit ships `skills/` folders with LLM-readable instruction files, directly validating our DVS/SKILL.md approach.

## Risks

- **ENS record gas costs** — setting multiple text records on mainnet. Batch if possible.
- **Subname creation** — `v1.estmcmxci.eth` requires either owning the name with a resolver that supports subnames, or using a service like NameWrapper.
- **IPFS gateway reliability** — have fallback gateways configured.
- **Signature verification complexity** — EIP-712 or EIP-191? Need to decide and implement.
- **Timeline** — hackathon kicks off Mar 13. Foundation + core layers should be done by then.
