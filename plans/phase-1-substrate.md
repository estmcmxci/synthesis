# Phase 1: Substrate — TRL Resolver Library

## Overview

Build `@synthesis/resolver` — the core TypeScript library that resolves an ENS name through 5 Resolution Layers into a TrustProfile.

**Input:** ENS name (e.g., `emilemarcelagustin.eth`)
**Output:** `TrustProfile { personhood, identity, context, manifest, skill, trustScore }`

Linear epic: SYN-6 · GitHub milestone: Phase 1: Substrate · Due: Mar 25

## Issues

| Issue | Task | Depends on | Status |
|-------|------|------------|--------|
| ~~SYN-15~~ | Scaffold packages/resolver/ | — | Done (PR #1) |
| ~~SYN-16~~ | Define types: TrustProfile, TrustTier (Zod) | — | Done (PR #1) |
| ~~SYN-17~~ | `utils/ens.ts` — normalization + text records | — | Done (PR #5) |
| ~~SYN-18~~ | `utils/erc7930.ts` — address encoding | — | Done (PR #6) |
| ~~SYN-19~~ | `utils/ipfs.ts` — gateway fetch | — | Done (PR #7) |
| ~~SYN-20~~ | `layers/identity.ts` — ENSIP-25 | SYN-17, 18 | Done (PR #8) |
| **SYN-21** | `layers/context.ts` — ENSIP-26 | SYN-17 | Next |
| **SYN-22** | `layers/manifest.ts` — AIP + signature verify | SYN-17, 19 | |
| **SYN-23** | `layers/skill.ts` — DVS / SKILL.md | SYN-17 | |
| **SYN-24** | `resolve()` — compose all layers | SYN-12, 20-23 | |
| **SYN-25** | `ensemble trust <name>` CLI command | SYN-24 | Flagship |
| **SYN-44** | `ensemble manifest create/pin/verify` CLI | SYN-22 | |
| **SYN-45** | `ensemble context set/get` CLI | SYN-21 | |
| **SYN-46** | `ensemble skill fetch` CLI | SYN-23 | |
| **SYN-48** | Extend `agent info` with trust tier | SYN-24 | |

## Architecture

```
@synthesis/resolver
├── src/
│   ├── index.ts              # Main exports
│   ├── schema.ts             # Zod schemas: TrustProfile, TrustTier, per-layer results
│   ├── layers/
│   │   ├── personhood.ts     # Layer 0: World ID AgentBook lookup (done)
│   │   ├── identity.ts       # Layer 1: ENSIP-25 — agent-registration records (done)
│   │   ├── context.ts        # Layer 2: ENSIP-26 — agent-context record
│   │   ├── manifest.ts       # Layer 3: AIP — signed manifest on IPFS
│   │   └── skill.ts          # Layer 4: DVS — SKILL.md fetch + domain verify
│   └── utils/
│       ├── ens.ts            # ENS normalization + text records (done)
│       ├── erc7930.ts        # ERC-7930 address encoding (done)
│       └── ipfs.ts           # IPFS gateway fetch (done)
```

### Key constraints (from BELIEFS.md)

- Resolution layers are **read-only** — never write records
- Zod validation on all inputs/outputs — no `any` in core domain
- ENS names are the root of trust — everything derives from on-chain records
- Business logic in the resolver library, not CLI command handlers

## Implementation Details

### SYN-21: `layers/context.ts` — ENSIP-26

Read the `agent-context` text record from an ENS name. Parse as JSON if structured.
Extract SKILL.md URL if present in the parsed content.

```typescript
interface ContextResult {
  found: boolean;
  raw: string | null;
  parsed: Record<string, unknown> | null;
  skillUrl: string | null;
}
```

The `agent-context` record can contain:
- A plain URL pointing to an agent description
- Structured JSON with skill URL, endpoints, capabilities
- Free-form text

### SYN-22: `layers/manifest.ts` — AIP (Agent Identity Profile)

Read AIP records from ENS:
1. `agent-latest` — current version string (e.g., "v1")
2. `agent-version-lineage` — lineage mode ("subname" or "list")
3. If subname mode: read `agent-manifest` from `<version>.<name>`
4. Fetch manifest from IPFS (uses `utils/ipfs.ts`)
5. Verify signature against ENS owner (EIP-191 via viem `verifyMessage`)
6. Walk `prev` chain for lineage integrity

```typescript
interface ManifestResult {
  found: boolean;
  latestVersion: string | null;
  lineageMode: string | null;
  manifest: AgentManifest | null;
  signatureValid: boolean;
  lineageDepth: number;
  lineageIntact: boolean;
}
```

See `spec/aip-draft.md` for the full manifest schema.

### SYN-23: `layers/skill.ts` — DVS (Domain-Verified SKILL.md)

1. Extract SKILL.md URL from the context result (Layer 2)
2. Fetch the SKILL.md content
3. Verify the serving domain is owned by the same ENS name
   - Parse domain from URL
   - Check if ENS name resolves to same domain (or if domain's ENS reverse record matches)

```typescript
interface SkillResult {
  found: boolean;
  domainVerified: boolean;
  content: string | null;
}
```

### SYN-24: `resolve()` — compose all layers

The main export. Runs all 5 layers in sequence, computes trust tier.

```typescript
async function resolve(ensName: string, options?: ResolveOptions): Promise<TrustProfile>
```

Trust tier computation (progressive — each requires all previous):
- `none` — no ENSIP-25 registration found
- `registered` — ENSIP-25 verified, on-chain identity confirmed
- `discoverable` — ENSIP-26 agent-context present
- `verified` — AIP manifest found, signature valid
- `full` — all layers verified, SKILL.md on verified domain, lineage intact

Personhood is an enrichment signal, not a tier gate.

### SYN-25: `ensemble trust <name>` CLI command

The flagship command. Runs `resolve()` and displays results.

```bash
ensemble trust emilemarcelagustin.eth
# → Personhood: ✓ (World ID, nullifier: 0x01c2...)
# → Identity:   ✓ (ERC-8004 #24994, Base)
# → Context:    ✓ (ENSIP-26, SKILL.md at skills.emilemarcelagustin.eth)
# → Manifest:   ✓ (AIP v1, signature valid, lineage depth: 1)
# → Skill:      ✓ (domain-verified, served from emilemarcelagustin.eth)
# → Trust Tier: full
```

### SYN-44, 45, 46: Layer-specific CLI commands

These expose individual layer operations as CLI subcommands:
- `ensemble manifest create/pin/verify` — AIP lifecycle
- `ensemble context set/get` — ENSIP-26 read/write
- `ensemble skill fetch` — DVS fetch + domain verify

Write commands (set, create, pin) use `ENS_PRIVATE_KEY` from `.env`.

### SYN-48: Extend `agent info`

Add trust tier display and ENSIP-25 linkage status to existing `ensemble agent info` command.

## ENS Names

| Name | Role | Address |
|------|------|---------|
| emilemarcelagustin.eth | Project ENS name (manager key in .env) | Manager: `0xeb0ABB367540f90B57b3d5719fd2b9c740a15022` |
| estmcmxci.eth | Personal ENS name (DO NOT use for project ops) | Owner: `0x703a...89B` |

## Dependencies

All installed in `packages/resolver/`:
- `viem` — ENS resolution, contract reads, signature verification
- `zod` — schema validation
- `@worldcoin/agentkit` — AgentBook personhood (Phase 0, done)

No Pinata SDK in the resolver — pinning is a CLI/OmniPin concern.

## Risks

- **ENSIP-25 records not set yet** — identity layer returns `verified: false` until Phase 3 (SYN-35). This is expected; the resolver code is correct.
- **AIP spec is a draft** — `spec/aip-draft.md` may evolve. Keep manifest schema loose.
- **SKILL.md domain verification** — need to define what "domain ownership" means for ENS-served sites vs traditional domains.
- **Agent ID discovery** — ENSIP-25 requires knowing the agent ID to query. Currently passed as `knownAgentIds[]`. May need a scan/enumeration approach later.
