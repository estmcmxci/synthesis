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
| **SYN-21** | `layers/context.ts` — ENSIP-26 | SYN-1`layers/manifest.ts` — AIP + signature verify | SYN-17, 19 | |
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
│   ├── schema.ts             # Zod sche, per-layer results
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
- Zod validation on all inputs/ou records
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
3. If subname mode: read `agenst` from `<version>.<name>`
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
interce SkillResult {
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
# → Personhood: ✓ (World ID,...)
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
| estmcmxci.eth | Personal ENS name (DO NOT uner: `0x703a...89B` |

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

---

## Results — Completed 2026-03-21

### What was built

The `@synthesis/resolver` library and all supporting CLI commands are complete. The TRL can resolve any ENS name through 5 layers and produce a TrustProfile.

**Resolver library (`packages/resolver/`):**

| File | Layer | PR |
|------|-------|----|
| `src/layers/personhood.ts` | 0 — World ID AgentBook lookup | #2 (Phase 0) |
| `src/layers/identity.ts` | 1 — ENSIP-25 agent-registration | #8 |
| `src/layers/context.ts` | 2 — ENSIP-26 agent-context | #9 |
| `src/layers/manifest.ts` | 3 — AIP V2 Mode A manifest + signature + lineage | #10 |
| `src/layers/skill.ts` | 4 — DVS SKILL.md fetch + domain verification | #11 |
| `src/resolve.ts` | Composer — runs all layers, computes trust tier | #12 |
| `src/utils/ens.ts` | ENS normalization + text records | #5 |
| `src/utils/erc7930.ts` | ERC-7930 address encoding for ENSIP-25 keys | #6 |
| `src/utils/ipfs.ts` | IPFS gateway fetch with multi-gateway fallback | #7 |
| `src/schema.ts` | Zod schemas for all types | #1, #8-#12 |

**CLI commands (`packages/cli/`):**

| Command | Purpose | PR |
|---------|---------|-----|
| `ensemble trust <name>` | Flagship — full TRL resolution, all 5 layers | #13 |
| `ensemble personhood check <addr>` | AgentBook lookup | #3 |
| `ensemble personhood register <addr>` | World ID registration flow | #4 |
| `ensemble manifest create <name>` | Create + sign AIP manifest (EIP-191) | #15 |
| `ensemble manifest pin <file>` | Pin manifest to IPFS via Pinata | #15 |
| `ensemble manifest verify <name>` | Verify manifest signature + lineage | #15 |
| `ensemble context get <name>` | Read ENSIP-26 agent-context | #16 |
| `ensemble context set <name> <value>` | Write agent-context text record | #16 |
| `ensemble skill <name> <url>` | Fetch SKILL.md + verify domain | #17 |
| `ensemble agent info` (extended) | Now shows ENSIP-25 key + personhood | #14 |

### Architecture decisions

1. **Direct viem over AgentKit SDK for personhood** — simpler, fewer deps, same ABI.
2. **Read-only resolver, write commands in CLI** — per BELIEFS.md, resolution layers never write.
3. **AIP V2 Mode A (subname-per-version)** — confirmed with spec author as the relevant mode. Mode B (list) parsing included but not primary.
4. **No Pinata SDK in resolver** — pinning is a CLI concern. Resolver only fetches from IPFS via public gateways.
5. **ERC-7930 bracket format** — follows ENSIP-25 spec `[registry][agentId]`, but parser also accepts slash format for CLI backward compatibility.
6. **`--ver` not `--version` for manifest create** — `--version` conflicts with incur's built-in version flag.
7. **Trust tier is progressive, personhood is optional** — personhood enriches the profile but doesn't gate tier progression. An agent can reach `full` without World ID.

### Current state of `ensemble trust emilemarcelagustin.eth`

```
✓ Personhood: World ID, nullifier: 0x1c2d8c2a...
✗ Identity:   no ENSIP-25 registration found
✗ Context:    no agent-context record
✗ Manifest:   no AIP records found
✗ Skill:      no SKILL.md found
Trust Tier: none
```

Personhood is the only layer that passes — the remaining 4 layers require ENS records to be set on-chain (Phase 3: Hosting, SYN-33 through SYN-37).

### What's next

Phase 2: Application (SYN-7) — build the Next.js site at `emilemarcelagustin.eth`. Or Phase 3: Hosting (SYN-8) — set the ENS records and deploy to IPFS to make the trust profile light up.
