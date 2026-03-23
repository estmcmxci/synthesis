# Architecture — Deliberate Legibility as a Stack

How the Trust Resolution Layer, the personal site, the decentralized web stack, and the identity token compose into a single system — with proof-of-personhood at the base.

---

## The Stack

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   SPENDING LAYER — Agent Card + x402                    │
│   Autonomous crypto + fiat spending for verified agents │
│   USDC-collateralized virtual card (Visa/Mastercard)    │
│   x402 agent-to-agent payments, TRL-verified            │
│   Spend limits enforced by TRL trust tier               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   WALLET LAYER — Agent Wallet                           │
│   Safe smart account on Base, passkey-owned (WebAuthn)  │
│   Session keys scoped by TRL trust tier policies        │
│   ERC-4337 (bundler + paymaster for gasless ops)        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   PRODUCT LAYER — Identity Token                        │
│   Launch a profile coin backed by verified identity     │
│   Clanker (ERC-20 factory) on Base                      │
│   Uniswap V4 pool, creator fee rewards                  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   APPLICATION LAYER — Personal Site                     │
│   Next.js on Vercel (dynamic) + IPFS via ENS (static)   │
│   Essay, trust profile, resolver, token launch UI       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   SUBSTRATE LAYER — Trust Resolution Layer (TRL)        │
│   Personhood + ENSIP-25 + ENSIP-26 + AIP + DVS          │
│   Resolve any ENS name → verified trust profile         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   HOSTING LAYER — Decentralized Web Stack               │
│   IPFS + ENS content hash + OmniPin + Safe              │
│   Censorship-resistant, content-addressed, verifiable   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   PERSONHOOD LAYER — World ID + AgentKit                │
│   Proof-of-personhood via biometric orb verification    │
│   AgentBook on-chain lookup (Base + World Chain)        │
│   "Is a real human behind this agent?" (boolean)        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Each layer depends on the one below it. Personhood is the floor — a biometric proof that a real human exists. The substrate turns that binary signal into a gradient. Nothing above works without the substrate. Nothing is permanent without the hosting layer. The wallet layer gives the agent a self-sovereign account owned by the human's biometric. The spending layer at the top closes the loop — a verified agent that can act in the world.

### Layer Terminology

This project uses "layer" in two distinct contexts:

| Term | Scope | Range | Example |
|------|-------|-------|---------|
| **Layer** (unqualified) | Product stack | 0–5 | "Layer 3" = Identity Token |
| **Resolution Layer** | TRL internals | 0–4 | "Resolution Layer 3" = AIP manifest |

The product stack layers (this document) describe how the system composes end-to-end. The resolution layers (in `PRD.md`, `PLAN.md`) describe the five verification steps inside the TRL substrate. When in doubt: bare "Layer N" = product stack, "Resolution Layer N" = TRL.

---

## Layer 0: Hosting — Decentralized Web Stack

**What**: IPFS pinning + ENS content hash + OmniPin orchestration + Safe multisig
**Spec**: `SKILL-decentralized-web-stack.md`

Provides censorship-resistant, content-addressed hosting for all static artifacts. The ENS content hash is set on-chain, meaning anyone can independently verify that the content served at `emilemarcelagustin.eth.limo` matches what's recorded.

**Hosts:**
- "The Abstracted Self" essay (permanent, uncensorable)
- SKILL.md (machine-readable capability file)
- AIP manifests (signed, versioned identity documents)
- Trust profile snapshots (point-in-time verification proofs)
- Token metadata and images (Clanker expects IPFS URIs)

**Key property**: deterministic CIDs. Same source always produces the same hash. A signer can rebuild locally, compare CIDs, and know nothing was tampered with.

---

## Layer 0.5: Personhood — World ID + AgentKit

**What**: Proof-of-personhood via biometric orb verification and on-chain AgentBook lookup
**Spec**: [Worldcoin AgentKit](https://github.com/worldcoin/agentkit)

The personhood layer answers the most fundamental question in agent trust: "Is a real, unique human behind this agent?" World ID uses biometric verification (iris scan via the Orb) to generate a nullifier hash — an anonymous, unique human identifier. An agent registered in the on-chain AgentBook contract can prove human backing without revealing who that human is.

```
lookupHuman(agentAddress) → { verified: boolean, nullifierHash: string }
```

This is a binary — yes or no. The TRL (Layer 1) takes this signal and extends it into a multi-dimensional trust gradient. An agent that passes personhood but has no ENSIP-25 record is more trustworthy than a pure bot, but less trustworthy than one with a full identity stack.

**AgentBook contracts:**
- Base mainnet: `0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4`
- World Chain: `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`

**Key property**: personhood is *anonymous* — the nullifier proves uniqueness without linking to a real-world identity. ENSIP-25 (Layer 1 of the TRL) adds *named* identity on top. The combination is powerful: a provably unique human who has chosen to be legible.

---

## Layer 1: Substrate — Trust Resolution Layer

**What**: TypeScript library that resolves an ENS name through 5 trust layers
**Spec**: `PRD.md`, `ONE-PAGER.md`

```
resolve("emilemarcelagustin.eth") → TrustProfile {
  personhood: World ID — proof-of-personhood (AgentKit / AgentBook)
  identity:   ENSIP-25 — on-chain registry (ERC-8004)
  context:    ENSIP-26 — agent-context record
  manifest:   AIP      — signed, versioned manifest on IPFS
  skill:      DVS      — SKILL.md on verified domain
  trustScore: "full"
}
```

The TRL is the primitive everything else builds on. It answers: "Can I verify who this entity is, what they do, whether they've changed, and how to interact with them — using only their ENS name?"

### Relationship to Worldcoin AgentKit

AgentKit is the **Layer 0 analog** — it provides proof-of-personhood via World ID biometric verification. An agent registered in AgentBook (on Base or World Chain) can prove that a unique human is behind it, without revealing who that human is.

**AgentKit gives you a boolean. Synthesis gives you a gradient.**

AgentKit answers one question: "is a real human behind this agent?" The TRL takes that binary signal and builds four more layers on top — identity, discovery, integrity, capability — producing a progressive trust tier rather than a yes/no. The personhood check is the floor; the TRL is the staircase.

Borrowed patterns from AgentKit:
- **Gasless relay** — AgentKit sponsors Base registration gas via relay. Same pattern applies to ERC-8004 registration for lower friction.
- **x402 hooks** — AgentKit is built as an x402 extension (402 challenge → signature → on-chain lookup → access policy). This is the access-control layer that *consumes* TrustProfiles.
- **CAIP-122 challenge flow** — chain-agnostic request-time verification, compatible with ENSIP-25 identity.
- **SKILL.md pattern** — AgentKit ships `skills/` folders with LLM-readable instruction files, directly validating the DVS/SKILL.md approach.

**AgentBook contracts:**
- Base mainnet: `0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4`
- World Chain: `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`

**Depends on Personhood Layer**: The personhood check is the first resolution step — without it, trust starts at Layer 1 (identity) rather than Layer 0.

**Depends on Hosting Layer**: The AIP manifest lives on IPFS (hosting layer stores it). The SKILL.md is served from `emilemarcelagustin.eth.limo` (hosting layer provides the gateway). The content hash itself is a verifiable artifact that the TRL can check.

---

## Layer 2: Application — Personal Site

**What**: Next.js site deployed to Vercel (dynamic) and IPFS (static)
**Spec**: `SITE.md`

The site serves two audiences simultaneously:

**For humans:**
- Landing page — who you are, the thesis of deliberate legibility
- "The Abstracted Self" — the essay that diagnosed algorithmic legibility as psychic violence
- Trust profile — live visualization of your TRL verification status
- Resolver — interactive tool to resolve any ENS name through the TRL

**For machines:**
- JSON-LD structured data on every page
- SKILL.md at root (machine-readable capability file)
- Open Graph / meta tags (social legibility)
- `agent-context` ENS record pointing to the site
- Content-addressed static mirror on IPFS

### Dual Deployment

The site has two homes — one for each audience's needs:

```
emilemarcelagustin.eth
     │
     ├── contenthash (IPFS) ──→ Static mirror (dweb)
     │     emilemarcelagustin.eth.limo
     │     Essay, SKILL.md, trust snapshot, token metadata
     │     Permanent, verifiable, censorship-resistant
     │
     └── agent-context ──→ Dynamic site (Vercel)
           emilemarcelagustin.vercel.app (or custom domain)
           TRL resolver, token profile, wallet connect
           Server-side ENS reads, live contract data
```

**Static content** (essay, about, SKILL.md) is built with `next export` and pinned to IPFS via the Layer 0 pipeline. Accessible at `emilemarcelagustin.eth.limo`.

**Dynamic features** (resolver, token profile, live trust profiles) run on Vercel with server functions for RPC calls and contract reads.

Both serve the same brand, same content where they overlap. If Vercel goes down, the essay and identity artifacts survive on IPFS. If IPFS gateways lag, Vercel serves everything.

---

## Layer 3: Product — Identity Token

**What**: A single canonical identity token for emilemarcelagustin.eth, deployed as a one-time ceremony that proves the entire stack is operational
**Spec**: `IDENTITY-TOKEN.md`

$IDENTITY_TOKEN is not a platform — it's the financialization of a single verified identity. One token, deployed once, gated by the full stack. The token *cannot exist* unless everything underneath it is live and passing: personhood, identity, context, manifest, skill, site, hosting. It is cryptographic proof that the stack works.

### The Launch Ceremony

A single CLI command that can only succeed when every layer is operational:

```
ensemble launch emilemarcelagustin.eth

  Step 1: Resolve TRL
  │  Run full trust resolution against all 5 layers
  │  REQUIRE: trustScore === "full"
  │  If any layer fails → abort with diagnostic
  │
  Step 2: Verify site is live
  │  Check ENS contenthash is set (IPFS CID exists)
  │  Fetch emilemarcelagustin.eth.limo → confirm 200 OK
  │  REQUIRE: contenthash set AND gateway responding
  │
  Step 3: Verify caller owns the name
  │  Signer address must match ENS owner
  │  (private key or Ledger)
  │
  Step 4: Deploy token via Bankr
  │  Bankr API → Clanker factory on Base
  │  - ERC-20 (fixed 100B supply)
  │  - Uniswap V4 pool (WETH pair, 1.2% swap fee)
  │  - Token image pinned to IPFS (Layer 0)
  │  - Metadata links back to TRL profile (Layer 2)
  │  - Creator earns up to 80% of trading fees
  │
  Step 5: Record the token on-chain
  │  Set ENS text record: identity-token = <contract address>
  │  Now resolvable by anyone querying emilemarcelagustin.eth
  │
  Done.
  $IDENTITY_TOKEN is live. The stack is proven.
```

The ceremony is irreversible and non-repeatable for a given ENS name. The token's existence is proof that at the moment of deployment, every layer — from biometric personhood to domain-verified skills — was verified and the site was serving.

Bankr handles the actual crypto execution (Clanker deployment, fee claiming, swaps, transfers) — no custom contract interaction code needed.

### /token page (profile, not deployment UI)

The site's `/token` page displays the token's live state — not a deployment flow:
- Live price + chart (Uniswap pool data)
- Trust profile of the deployer (TRL-resolved)
- Trading link (Uniswap on Base)
- Fee earnings (claimable WETH + token)
- Token contract address, metadata, IPFS links

### Bankr as Crypto Execution Layer

Bankr serves as the agent's crypto rail across the entire stack:

| Operation | How |
|-----------|-----|
| Token deployment | Bankr → Clanker factory on Base |
| Fee claiming | Bankr → claim accumulated WETH + token |
| USDC transfers | Bankr → direct transfer or x402 payment |
| Token swaps | Bankr → Uniswap routing |
| Balance queries | Bankr → multi-chain portfolio |

This eliminates the need for custom wallet client code, Clanker SDK integration, or direct contract calls for routine crypto operations. The CLI and site both delegate to Bankr for execution.

**Depends on all layers below:**
- Layer 0 hosts the token's metadata and image (IPFS)
- Layer 1 verifies the deployer's identity (TRL)
- Layer 2 provides the token profile page (site)

---

## Layer 4: Wallet — Agent Wallet

**What**: A Safe smart account on Base, owned by a biometric passkey, with session keys scoped by TRL trust tier
**Spec**: `AGENT-WALLET.md`

The wallet layer is the bridge between identity and action. The TRL says *who* an agent is. The wallet lets it *spend*.

```
Biometric (Face ID / fingerprint)
  → Passkey (Secure Enclave, WebAuthn, non-exportable)
    → Safe Smart Account (passkey = owner signer)
      → Session Key (agent's scoped cryptographic capability)
         - Allowed contracts, functions, amounts
         - Time-bounded, auto-expiring
         - Revocable instantly by passkey holder
```

**Passkey as root of trust.** The Safe owner isn't an EOA with a seed phrase — it's a WebAuthn passkey bound to the human's biometric. The key lives in the device's Secure Enclave. It cannot be exported, phished, or delegated. The human's body is the ultimate signer.

**Session keys, not custodied keys.** The agent never holds the owner key. It receives a scoped session key — a cryptographic capability that lets it sign transactions within policy bounds. The SmartSession module enforces policies on-chain: allowed contracts, spending limits, time windows.

**Trust-tier-scoped policies.** TRL trust tier maps directly to session key policy:
- `full` → high limits, broad contract allowlist, 30-day sessions
- `verified` → moderate limits, core contracts, 7-day sessions
- `discoverable` → low limits, USDC only, 24-hour sessions
- `registered` → micro-transactions, 1-hour sessions
- `none` → no session key issued

**ERC-4337 native.** Transactions go through the EntryPoint as UserOperations. A paymaster sponsors gas, so the agent doesn't need ETH — just the session key and intent.

**Depends on all layers below:**
- Layer 0 hosts module ABIs and session metadata (IPFS)
- Layer 1 provides the trust tier that determines policy bounds (TRL)
- Layer 2 provides the wallet creation and session management UI (site)
- Layer 3 provides the financial assets the wallet holds (identity token)

---

## Layer 5: Spending — Agent Card + x402

**What**: Virtual Visa/Mastercard funded by the agent's on-chain USDC balance, plus x402 agent-to-agent payments — both trust-scoped
**Spec**: `AGENT-CARD.md`

The spending layer has three rails. Bankr handles crypto execution; the Safe + session keys provide the self-sovereign foundation; the card bridges to fiat:

```
Bankr Wallet + Safe Smart Account (USDC on Base)
     |
     +--- Crypto ──→ Swaps, transfers, contract calls (via Bankr)
     |
     +--- x402  ──→ Agent-to-agent paid API calls (TRL-verified)
     |
     +--- Fiat  ──→ USDC collateral → Virtual card → Visa/Mastercard
```

**Three rails, one identity.** Bankr provides the execution layer for crypto operations. The Safe provides self-sovereign ownership via passkey. x402 adds trust-verified agent-to-agent payments. The card bridges to fiat.

**x402 with TRL verification.** Coinbase's x402 protocol enables machine-to-machine paid API calls. We extend it: before paying, the agent resolves the payee through TRL. Before responding, the payee resolves the payer. Both sides verify identity before money moves. No anonymous payments to unverified addresses.

**Trust-scoped spending.** The card issuer doesn't decide the agent's limits — the TRL does, enforced by the session key's on-chain policy. An agent with `trustScore: "full"` gets higher ceilings than one with `"registered"`.

**MCP-native.** The agent requests card details and executes payments through MCP tools. No human in the loop for authorized transactions — the session key policy *is* the authorization.

**Depends on all layers below:**
- Layer 0 hosts the escrow contract ABIs and metadata (IPFS)
- Layer 1 provides the trust tier that determines spend limits (TRL)
- Layer 2 provides the card management UI and dashboard (site)
- Layer 3 provides the financial substrate — token holdings fund the card
- Layer 4 provides the wallet — the Safe and session key that actually sign transactions

---

## The Reference Implementation

emilemarcelagustin.eth is the first entity to pass through this entire stack:

| Layer | Artifact | Status |
|-------|----------|--------|
| 0 — Personhood | World ID + AgentBook (Base / World Chain) | To integrate |
| 0.5 — Hosting | IPFS + ENS content hash | To deploy |
| 1 — Substrate | ERC-8004 #24994 on Base, ENSIP-25 verified | Live |
| 2 — Application | Personal site (Next.js) | To build |
| 3 — Product | $IDENTITY_TOKEN identity token (via Bankr → Clanker) | To launch |
| 4 — Wallet | Safe smart account, passkey-owned, session keys | To build |
| 5 — Spending | Agent card + x402 (TRL-verified, tri-rail) | To research |

"The Abstracted Self" diagnosed algorithmic legibility as the loss of interiority — the self dissolved into performativity under the algorithmic gaze. The site is the inversion: deliberate, conscious, architected legibility. The token is its financialization. The dweb stack ensures none of it can be taken down.

---

## Build Order

```
Phase 0: Personhood
  └── World ID / AgentKit integration
       └── AgentBook on-chain lookup (Base + World Chain)
       └── Register emilemarcelagustin.eth agent wallet in AgentBook via AgentKit CLI
       └── Integrate into TRL as Layer 0 of resolution flow

Phase 1: Substrate
  └── TRL resolver library (TypeScript, viem)
       └── Personhood, ENSIP-25, ENSIP-26, AIP, DVS resolution
       └── Trust tier computation

Phase 2: Application
  └── Next.js site scaffold
       └── Landing, essay, resolver UI, trust profile
       └── Machine-readable layer (JSON-LD, SKILL.md, OG tags)
       └── Deploy to Vercel

Phase 3: Hosting
  └── Dweb deployment pipeline
       └── Static export of content pages
       └── IPFS pin via OmniPin
       └── ENS content hash update
       └── Verify at emilemarcelagustin.eth.limo

Phase 4: Product — Launch Ceremony
  └── `ensemble launch emilemarcelagustin.eth`
       └── Implement launch command (TRL full + site live + owner check)
       └── Pin token image + metadata to IPFS (Layer 0)
       └── Deploy $IDENTITY_TOKEN via Bankr → Clanker on Base
       └── Write token contract address to ENS text record
       └── Token profile page on site (/token)

Phase 5: Wallet
  └── Agent wallet infrastructure
       └── Deploy Safe on Base with WebAuthn passkey owner
       └── Enable SmartSession module + policy contracts
       └── Session key creation UI (passkey auth → configure → issue)
       └── Agent-side SDK (deserialize session, construct UserOps)
       └── Pimlico bundler + paymaster integration
       └── Wire session policies to TRL trust tiers

Phase 6: Spending
  └── Agent card + x402 (tri-rail: crypto, agent-to-agent, fiat)
       └── Bankr as crypto execution layer (swaps, transfers, fee claims)
       └── x402 payment flow with TRL verification on both sides
       └── Evaluate card issuers (Immersve, Lithic + Bridge)
       └── USDC collateral from Safe → card funding
       └── Session management dashboard (view, revoke, renew)
       └── Trust-tier-scoped spend limits
```

---

## File Index

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | This file — how all product stack layers compose |
| `PLAN.md` | Build plan, CLI gap analysis, scaffolding, Bankr integration |
| `PRD.md` | TRL product requirements, TrustProfile interface, resolution steps |
| `ONE-PAGER.md` | Hackathon pitch, architecture diagram, deliverables |
| `README.md` | Hackathon registration details, API key, wallet, token IDs |
| `SITE.md` | Personal site concept, routes, design direction |
| `IDENTITY-TOKEN.md` | Token launch ceremony spec, Clanker + Bankr integration |
| `AGENT-WALLET.md` | Agent wallet infra — Safe, passkeys, session keys |
| `AGENT-CARD.md` | Agent card product spec, card issuer evaluation |
| `X402-DEMO-HOOK.md` | x402 trust-gated payments — TRL + x402 composition |
| `SKILL-decentralized-web-stack.md` | Dweb deployment pipeline (IPFS + ENS + OmniPin + Safe) |
| `context.md` | SKILL.md / DVS trust hierarchy (Resolution Layer 4 of TRL) |
| `spec/aip-draft.md` | Agent Identity Profile spec (Resolution Layer 3) |
| `spec/agent-skill-8004-25.md` | Celonames reference — ENSIP-25 + ERC-8004 on Celo |
| `The Abstracted Self.pdf` | The essay — algorithmic legibility as psychic violence |
