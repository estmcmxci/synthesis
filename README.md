# Ensemble

**A CLI for the Trust Resolution Layer — a primitive for verifiable agent identity, capability discovery, and version integrity, anchored to ENS.**

## Live reference deployment

🚀 **[https://estmcmxci.co/agent/emilemarcelagustin.eth](https://estmcmxci.co/agent/emilemarcelagustin.eth)**

A working ENS-bound agent: personhood-anchored via World ID/AgentBook, identity-bound via ENSIP-25 / ERC-8004, with a published delegation policy, a ZeroDev kernel wallet signed by a Namera session key, and a live chat surface — all verifiable from a public RPC, with no registrar, CA, or platform in the trust chain.

The same domain (`estmcmxci.co`) is DNSSEC-imported into ENS, so it resolves both as a DNS name and as an ENS name to the same on-chain identity.

You can re-run the verification yourself in ~10 seconds:

```bash
pnpm --filter @synthesis/conformance exec conformance run emilemarcelagustin.eth
# expect: 6/6 layers pass + a Merkle root over the case results
```

See [Verify it yourself](#verify-it-yourself) for the full check.

## Problem

Agents can't trust each other. There's no standard way for one agent to verify another's identity, discover its capabilities, or confirm it hasn't silently changed since the last interaction. Without this, multi-agent cooperation is built on faith — and reputation systems have no verifiable foundation.

## Solution

Ensemble exposes **two distinct verification surfaces** — they answer different questions and you usually want both.

### 1. Trust Resolution Layer (TRL) — *breadth*

Five conceptual layers, each backed by a different protocol, each answering a different trust question. This is the cross-cutting "do I trust this agent at all?" check, computed via `resolve()` in `@synthesis/resolver`.

```
ENS Name → Personhood → Identity → Discovery → Manifest → Capability → Trust Profile
```


| Resolution Layer | Standard                     | Question Answered                                     |
| ---------------- | ---------------------------- | ----------------------------------------------------- |
| 0 — Personhood   | World ID / AgentBook         | "Is a real human behind this agent?"                  |
| 1 — Identity     | ENSIP-25 + ERC-8004          | "Is this agent registered in an on-chain registry?"   |
| 2 — Discovery    | ENSIP-26                     | "What does this agent do? How do I interact with it?" |
| 3 — Manifest     | AIP                          | "Has this agent changed since I last trusted it?"     |
| 4 — Capability   | DVS + SKILL.md               | "How do I reliably use this agent's services?"        |

Each layer fails independently; the aggregate produces a **trust tier** (see below).

### 2. ENSIP-64 record verification — *depth*

A separate, narrower audit on **the 9 ENSIP-64 records** (the Node Metadata Standard, "NMS") that constitute the Layer 2 / Discovery evidence. Five **cryptographic** checks on the same set of records, computed via `verifyAgentIdentity()` in `@synthesis/resolver`. This is the engine behind `ensemble agent verify` and the **`@synthesis/conformance`** runtime suite.

| Check       | What it asserts                                                        |
| ----------- | ---------------------------------------------------------------------- |
| Records     | All 9 NMS records present + syntactically well-formed                  |
| Schema      | Records validate against the published JSON Schema 2020-12 doc         |
| Integrity   | `keccak256(JCS(policy))` matches the on-chain `policy-hash`            |
| Binding     | Policy doc references the same kernel-wallet + runtime-pubkey + ENS    |
| Liveness    | Daemon at `agent-endpoint[web]/health` returns 200                     |

**TRL = breadth** (5 protocols, 5 questions). **ENSIP-64 = depth** (5 cryptographic strictness checks on one piece of evidence). Not the same 5 layers — they zoom in on different parts of the same agent.


### Trust Tiers

Each tier requires all previous layers to pass:

- **none** — no ENSIP-25 registration found
- **registered** — on-chain identity confirmed (ERC-8004)
- **discoverable** — agent-context record present (ENSIP-26)
- **verified** — AIP manifest found, signature valid
- **full** — all layers verified, SKILL.md on verified domain, lineage intact

## Packages


| Package                  | Description                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@synthesis/resolver`    | Core TypeScript library — resolves any ENS name through all 5 TRL layers + 5 ENSIP-64 record-level checks (records / schema / integrity / binding / liveness)   |
| `@synthesis/cli`         | `ensemble` CLI — agent identity lifecycle (`issue → pin → publish → verify → rotate`), ENS records, manifests, content pinning                                  |
| `@synthesis/conformance` | Runtime + verifier audit suite — drives `verifyAgentIdentity` against a live agent, runs adversarial fixtures against any verifier, emits Merkle-rooted reports |
| `@synthesis/site`        | Next.js explorer + trust profiles + chat surface (deployed at [https://estmcmxci.co](https://estmcmxci.co))                                                     |


## Quick Start

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm --filter @synthesis/cli build

# Resolve an ENS name through the full trust stack
ensemble trust <name>.eth

# Verify an ENS-bound agent (5 ENSIP-64 record-level layers)
ensemble agent verify <name>.eth

# Set ENS text records
ensemble edit txt <name>.eth <key> <value>

# Create and sign an AIP manifest
ensemble manifest create --sign --pin
```

The full agent-identity lifecycle is:

```bash
ensemble agent issue <alias>            # bootstrap wallet stack (keystore + smart account + session key)
ensemble agent pin <dir>                # pin schema + policy doc to IPFS via Pinata
ensemble agent publish <ens-name>       # broadcast 9 ENSIP-64 records (multicall)
ensemble agent verify <ens-name>        # 5-layer verification
ensemble agent rotate <alias> --ens <ens-name>   # rotate session key + bump policy version
```

Per-layer commands also exist (one per TRL layer):

```bash
ensemble personhood <address>           # World ID / AgentBook check (Layer 0)
ensemble agent register / link          # ENSIP-25 / ERC-8004 (Layer 1)
ensemble context <name>                 # ENSIP-26 agent-context (Layer 2)
ensemble manifest <name>                # AIP signed manifest (Layer 3)
ensemble skill <name>                   # SKILL.md + DVS domain check (Layer 4)
```

During development, use `pnpm --filter @synthesis/cli dev -- <command>` to run without building.

### As a library

```typescript
import { resolve, verifyAgentIdentity } from '@synthesis/resolver'

// Conceptual TRL — 5 layers, one per protocol
const profile = await resolve('example.eth')
// profile.trustScore === 'full' | 'verified' | 'discoverable' | 'registered' | 'none'
// profile.personhood.verified
// profile.identity.agentId
// profile.context.found
// profile.manifest.signatureValid
// profile.skill.domainVerified

// Deep verification — 5 cryptographic record-level checks
const result = await verifyAgentIdentity('example.eth')
// result.layers.records.passed
// result.layers.schema.passed
// result.layers.integrity.passed   (keccak256(JCS(policy)) === policy-hash)
// result.layers.binding.passed     (policy ↔ records key/wallet/ENS consistency)
// result.layers.liveness.passed    (HTTP /health on agent-endpoint[web])
// result.identityCard               (ENS, owner, kernel-wallet, runtime-pubkey, etc.)
// result.policy                     (scope, permitted classes, prohibited)
```

## Verify it yourself

The conformance suite is the **ENSIP-64 / NMS-record verification** path (the *depth* check from the Solution section). It does NOT recompute the conceptual TRL trust tier — it audits the cryptographic well-formedness of the 9 records that constitute Layer 2 evidence. For the full TRL profile use `ensemble trust <name>.eth` or `resolve()` in code; for the deep audit use the suite below.

```bash
pnpm install
pnpm --filter @synthesis/conformance build

# Runtime suite — drives verifyAgentIdentity against the live agent
# (5 ENSIP-64 record-level checks + an optional 6th signature challenge)
pnpm --filter @synthesis/conformance exec conformance run emilemarcelagustin.eth
# expect: 6/6 pass (records / schema / integrity / binding / liveness / signature)
#         + a Merkle root over the case results

# Verifier suite — runs 1 valid fixture + 8 adversarial mutators
# (tamper-policy, stale-hash, schema-reject, mismatch-kernel-wallet, etc.)
# through any verifier under test. Defaults to @synthesis/resolver.
pnpm --filter @synthesis/conformance exec conformance run --self-test
# expect: 9/9 pass in ~25ms + a Merkle root
```

`--format json` produces a machine-readable report with the same Merkle root — usable as a citable input for registry listing decisions, so the listing can be mechanical instead of political.

## Architecture

What's shipped today, top-down:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Application — Explorer at estmcmxci.co/agent/<name>                 │
│                (Trust Profile + Deep Verification panels + chat)     │
├──────────────────────────────────────────────────────────────────────┤
│  Conformance — runtime + verifier audit suite                        │
│                (Merkle-rooted reports, citable for listings)         │
├──────────────────────────────────────────────────────────────────────┤
│  Verification — 5 cryptographic checks on the 9 NMS records         │
│                 (records / schema / integrity / binding / liveness)  │
├──────────────────────────────────────────────────────────────────────┤
│  Trust Resolution Layer (TRL) — 5 conceptual layers                 │
│   0 Personhood   World ID via AgentBook                              │
│   1 Identity     ENSIP-25 / ERC-8004                                 │
│   2 Discovery    ENSIP-26 (records published as the 9 NMS fields)   │
│   3 Manifest     AIP — signed manifest + version lineage             │
│   4 Capability   DVS — domain-verified SKILL.md                      │
├──────────────────────────────────────────────────────────────────────┤
│  Wallet — ZeroDev kernel (Base) + Namera session keys               │
│           (scoped by the published delegation policy)                │
├──────────────────────────────────────────────────────────────────────┤
│  Hosting — IPFS (schema + policy doc, via Pinata)                   │
│            + ENS records on mainnet                                  │
│            + Pinata-hosted runtime daemon (agent-endpoint[web/chat]) │
└──────────────────────────────────────────────────────────────────────┘
```

WebAuthn-rooted operator credentials are the next layer above Wallet (positioning draft pending). The runtime + DNS productization is tracked at [issue #59](https://github.com/estmcmxci/synthesis/issues/59).

For source-level detail, read `packages/resolver/src/` (the resolver + ENSIP-64 verifier), `packages/conformance/src/` (the audit suite), and `packages/site/src/app/agent/[name]/` (the explorer composing both verification views).

## Standards composed

The reference deployment composes the following standards behind one URL. All are independently auditable; none assume trust in this repo.

- **[World ID](https://docs.world.org/) via AgentBook** — Layer 0 personhood. Owner address registered in the AgentBook contract on Base (`0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4`).
- **[ENSIP-25](https://github.com/ensdomains/ensips/blob/master/ensips/25.md) + [ERC-8004**](https://eips.ethereum.org/EIPS/eip-8004) — Layer 1 on-chain agent registration.
- **[ENSIP-26](https://github.com/ensdomains/ensips/pull/65)** — Layer 2 agent-context discovery.
- **[Agent Identity Profile (AIP)](./spec/aip-draft.md)** — Layer 3 signed manifest + version lineage.
- **DVS + SKILL.md** — Layer 4 domain-verified capability declaration.
- **ENSIP-64 (draft)** — the 9 machine-readable agent records: `class`, `schema`, `runtime-pubkey`, `runtime-status`, `kernel-wallet`, `agent-endpoint[web]`, `delegation`, `policy-hash`, `policy-version`.
- **[JSON Schema 2020-12](https://json-schema.org/draft/2020-12/release-notes.html)** — agent-record validation.
- **[RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785) + keccak256** — content-addressed policy-doc integrity. `policy-hash` on chain is `keccak256(JCS(policy-doc))`; the bytes *are* the identity.
- **[ZeroDev Kernel](https://docs.zerodev.app/) (smart-account) + [Namera](https://github.com/namera-ai) (session-key issuance)** — the agent's wallet stack. Kernel on Base; session signer issued under the published delegation policy.

WebAuthn-rooted operator credentials are the next layer (positioning draft pending).

## Development

```bash
# Build all packages
pnpm -r build

# Run the test suites
pnpm -r test

# Run the site locally (http://localhost:3000)
pnpm --filter @synthesis/site dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development conventions, the layer model, and how to propose changes.

## Roadmap

The on-chain identity layer is shipped (CLI + resolver + conformance + explorer site). The runtime daemon and DNS configuration are still operator-supplied; productizing those into `ensemble agent runtime` + `dns` subcommands is tracked at [issue #59](https://github.com/estmcmxci/synthesis/issues/59) and is the v0.2 milestone.

## Security

See [SECURITY.md](./SECURITY.md) for the vulnerability reporting policy. Please do not open public issues for security reports.

## License

[MIT](./LICENSE)