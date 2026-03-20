# Agent Card — Autonomous Spending Layer

## Concept

The Trust Resolution Layer verifies who an agent is. The identity token financializes that verification. The agent card completes the loop: a TRL-verified agent that can **spend** — in both crypto and fiat — with programmable limits enforced by identity.

This is Layer 4 of the product stack. An agent with a verified ENS name, an on-chain identity, and a funded wallet should be able to pay for anything — an API call, a domain renewal, a cloud bill — without a human copying card numbers into a form.

## Why Both Crypto and Fiat

Crypto-only agents are limited to on-chain interactions. Fiat-only cards (like AgentCard.sh) require manual funding and have no identity layer. The synthesis is an agent card that:

- **Crypto side**: the agent already holds assets in its Bankr wallet. Swaps, bridges, on-chain payments — this works today.
- **Fiat side**: a virtual Visa/Mastercard funded by the agent's on-chain balance (primarily USDC). The agent can pay for any service that accepts a card.

The crypto balance *is* the funding source. No separate bank account, no manual top-ups.

## How It Works

```
Agent Identity (ENS + ERC-8004 + TRL)
     |
     v
Bankr Wallet (holds ETH, USDC, ERC-20s on Base)
     |
     +--- Crypto payments (native, already works)
     |       Swaps, transfers, contract calls via Bankr
     |
     +--- Fiat payments (the new layer)
             |
             v
        USDC Collateral Lock
             |
             v
        Virtual Card Issued (Visa/Mastercard)
             |
             v
        Agent spends anywhere cards are accepted
```

### The Fiat Bridge

Two models, depending on card issuer:

**Model A: USDC-collateralized (preferred)**
- Agent locks USDC in a collateral contract or custodial account
- Card issuer (e.g. Immersve, Rain) issues a virtual card backed 1:1 by that USDC
- When the agent swipes, USDC is burned/transferred to cover the charge
- No fiat off-ramp needed — the issuer handles settlement
- Fastest path, least infrastructure

**Model B: Off-ramp funded**
- Agent triggers an off-ramp (Bridge by Stripe, Transak) to convert crypto to fiat
- Fiat lands in a funding account at the card issuer (Lithic, Stripe Issuing)
- Card draws from that fiat balance
- More flexible (any token, not just USDC) but adds latency

### Spend Controls

The identity layer enables trust-scoped spending:

| TRL Trust Tier | Spend Policy |
|----------------|-------------|
| `full` | Configurable limits, higher ceilings |
| `verified` | Moderate limits, daily caps |
| `discoverable` | Low limits, per-transaction approval |
| `registered` | Micro-transactions only |
| `none` | No card issued |

Limits can also be enforced by:
- **Smart contract escrow** — agent deposits USDC, contract enforces max-per-tx and daily caps
- **Card issuer API** — programmatic spend limits via Lithic/Immersve API
- **MCP policy** — the agent's MCP configuration can define what it's allowed to purchase

## Integration with Existing Stack

### From the Agent's Perspective (MCP)

```
Agent receives task: "Subscribe to OpenAI API — $20/mo"
     |
     v
Agent checks wallet balance (Bankr MCP)
     |
     v
Agent requests card details (Card MCP tool)
     |  POST /cards { amount: 2000, merchant_category: "software" }
     |  → { card_number, cvv, expiry, funded_from: "USDC" }
     |
     v
Agent uses card to complete purchase
     |
     v
Transaction logged, USDC deducted from collateral
```

### From the Platform's Perspective

The card is issued through the personal site or a dedicated dashboard:

1. User connects wallet, resolves ENS name through TRL
2. TRL verification gate (same as identity token deployment)
3. User configures card: spend limits, allowed categories, funding source
4. Card issuer API creates virtual card
5. Card details stored encrypted, accessible to the agent via MCP
6. Agent can now spend autonomously within the configured bounds

## Card Issuer Candidates

| Issuer | Model | Crypto-Native | API Quality | Notes |
|--------|-------|---------------|-------------|-------|
| **Immersve** | USDC collateral | Yes | Good | Built for this exact use case. On-chain USDC backs Mastercard spend. |
| **Rain** | USDC collateral | Yes | Good | Corporate cards backed by crypto. May require business entity. |
| **Lithic** | Fiat pre-fund | No | Excellent | Most developer-friendly. Needs off-ramp to fund. |
| **Stripe Issuing** | Fiat pre-fund | No | Excellent | Pairs with Bridge (Stripe's own off-ramp). |
| **Reap** | USDC collateral | Yes | Moderate | Asia-focused, supports USDC funding. |

**Recommendation**: Start with Immersve (USDC-native, no off-ramp needed). Fall back to Lithic + Bridge if Immersve doesn't fit.

## Relationship to AgentCard.sh

AgentCard.sh is a fiat-only prepaid card service for agents. It validates the market but has structural limitations:

- No on-chain identity — agents are authenticated via JWT, not verifiable credentials
- Fiat-only — no crypto spending capability
- Manual funding — no programmatic crypto-to-fiat bridge
- No trust tiers — all agents get the same flat spend limits

Our approach is differentiated by:
- **Identity-first**: card issuance is gated by TRL verification
- **Crypto-native**: USDC collateral, no manual funding
- **Dual-rail**: same agent spends crypto on-chain and fiat off-chain
- **Programmable trust**: spend limits scale with verified identity

## Build Sequence

This is Phase 3 — after the identity token and personal site are live.

```
Phase 3a: Research & Partner
  +-- Evaluate Immersve API (USDC collateral model)
  +-- Evaluate Lithic + Bridge as fallback
  +-- Determine KYC requirements and entity structure
  +-- Prototype card creation via API

Phase 3b: Smart Contract Layer
  +-- USDC escrow contract (deposit, lock, release on spend)
  +-- Spend policy contract (per-tx limits, daily caps, category restrictions)
  +-- TRL trust tier integration (on-chain lookup for limit computation)

Phase 3c: MCP Integration
  +-- Card MCP tool: request card, check balance, view transactions
  +-- Bankr wallet integration: auto-fund from agent's USDC balance
  +-- Spend approval flow: agent requests, policy checks, card funded

Phase 3d: Dashboard
  +-- Card management UI on personal site
  +-- Fund card, set limits, view spend history
  +-- Revoke card, freeze, adjust policies
```

## Open Questions

- [ ] Which card issuer to partner with first? Immersve is ideal but needs evaluation.
- [ ] Entity structure — do we need a business entity for card program access?
- [ ] KYC flow — how does the ENS identity map to the issuer's KYC requirements?
- [ ] Multi-agent support — can one human issue cards to multiple agents with separate limits?
- [ ] Liability model — who is responsible if an agent overspends or is exploited?
- [ ] Should card issuance be a Bankr-native feature or a standalone product?
- [ ] Revenue model — transaction fee markup, subscription, or bundled with identity token?
