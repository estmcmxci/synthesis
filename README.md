# Trust Resolution Layer (TRL)

**A primitive for verifiable agent identity, capability discovery, and version integrity — anchored to ENS.**

## Problem

Agents can't trust each other. There's no standard way for one agent to verify another's identity, discover its capabilities, or confirm it hasn't silently changed since the last interaction. Without this, multi-agent cooperation is built on faith — and reputation systems have no verifiable foundation.

## Solution

A trust resolution primitive that composes emerging ENS standards into a single deterministic verification flow:

```
ENS Name → Identity → Context → Manifest → Skill → Trust Profile
```

Given any ENS name, an agent can resolve the full trust stack in one call:

| Resolution Layer | Standard | Question Answered |
|------------------|----------|-------------------|
| 0 — Personhood | World ID / AgentKit | "Is a real human behind this agent?" |
| 1 — Identity | ENSIP-25 + ERC-8004 | "Is this agent registered in an on-chain registry?" |
| 2 — Discovery | ENSIP-26 | "What does this agent do? How do I interact with it?" |
| 3 — Integrity | AIP (Agent Identity Profile) | "Has this agent changed since I last trusted it?" |
| 4 — Capability | DVS + SKILL.md | "How do I reliably use this agent's services?" |

### Trust Tiers

Each tier requires all previous layers to pass:

- **none** — no ENSIP-25 registration found
- **registered** — on-chain identity confirmed (ERC-8004)
- **discoverable** — agent-context record present (ENSIP-26)
- **verified** — AIP manifest found, signature valid
- **full** — all layers verified, SKILL.md on verified domain, lineage intact

## Packages

| Package | Description |
|---------|-------------|
| `@synthesis/resolver` | Core TypeScript library — resolves any ENS name through all 5 trust layers |
| `@synthesis/cli` | `ensemble` CLI — set records, sign manifests, verify trust, pin content |
| `@synthesis/site` | Next.js web app — interactive resolver, trust profiles, essays |

## Quick Start

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm --filter @synthesis/cli build

# Resolve an ENS name through the full trust stack
ensemble trust <name>.eth

# Set ENS text records
ensemble edit txt <name>.eth <key> <value>

# Create and sign an AIP manifest
ensemble manifest create --sign --pin
```

During development, use `pnpm --filter @synthesis/cli dev -- <command>` to run without building.

### As a library

```typescript
import { resolve } from '@synthesis/resolver'

const profile = await resolve('example.eth')
// profile.trustScore === 'full' | 'verified' | 'discoverable' | 'registered' | 'none'
// profile.personhood.verified
// profile.identity.agentId
// profile.context.found
// profile.manifest.signatureValid
// profile.skill.domainVerified
```

## Architecture

```
┌─────────────────────────────────────────────┐
│  Spending Layer — Agent Card + x402         │
├─────────────────────────────────────────────┤
│  Wallet Layer — Safe + Passkeys + Sessions  │
├─────────────────────────────────────────────┤
│  Product Layer — Identity Token (Clanker)   │
├─────────────────────────────────────────────┤
│  Application Layer — Personal Site          │
├─────────────────────────────────────────────┤
│  Substrate Layer — Trust Resolution (TRL)   │
├─────────────────────────────────────────────┤
│  Hosting Layer — IPFS + ENS Content Hash    │
├─────────────────────────────────────────────┤
│  Personhood Layer — World ID + AgentKit     │
└─────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full layer descriptions.

## Standards

- [ENSIP-25](https://github.com/ensdomains/ensips/blob/master/ensips/25.md) — Agent Registration Records
- [ENSIP-26](https://github.com/ensdomains/ensips/pull/65) — Agent Text Records (context + endpoints)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) — Agent Registry
- [Agent Identity Profile (AIP)](./spec/aip-draft.md) — Signed, versioned identity manifests

## Development

```bash
# Build all packages
pnpm -r build

# Run the site locally
pnpm --filter @synthesis/site dev
```

## License

MIT
