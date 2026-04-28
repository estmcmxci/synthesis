# TRL Policy + Signers — Generic primitives for gating and execution

Two new generic primitives in `@synthesis/resolver`, plus one CLI surface in `@synthesis/cli`. These are first-party Ensemble features — they ship for every consumer of TRL, not just for TrustSwap. TrustSwap (`plans/trust-gated-swap.md`) is the first downstream consumer and motivates this work, but the design is intentionally generic so any future agent app on TRL can adopt the gate-then-execute pattern.

## Positioning

A `TrustProfile` is a noun. To turn it into a verb — to *act* on it — you need two things TRL does not currently provide:

1. **A policy primitive** — a pure function that maps `(profile, policy) → decision`. Reusable from CLI, server actions, MCP tools, and long-lived agents. Pure, easily unit-tested, no I/O.
2. **A signer primitive** — a uniform interface for "this address signs and broadcasts a transaction," with two adapters: a viem-based EOA and a ZeroDev-kernel-account smart wallet (via `@namera-ai/sdk`). TRL is read-only; this is the first write-side abstraction TRL exposes for *consumers*. The resolver itself remains read-only — these adapters live in `packages/resolver` only because that's where the schema lives, but they perform no resolution.

Together, gate + signer is the minimum surface every "agent acts on TRL" application needs. Without them, every consumer reinvents the same two abstractions and they drift.

## Why this lives in synthesis (not in TrustSwap)

TrustSwap is *one* application of these primitives. Other plausible consumers — payments tools, gated bridges, A2A coordination, automated subscriptions, the existing `ensemble verify` flow — all want the same gate function over a `TrustProfile` and the same signer abstraction. Putting them in TRL itself means:

- One canonical implementation, one set of tests
- Real Ensemble feature, real version, real npm publication
- TrustSwap consumes them as a library dep, not as inline code
- The pattern doc (`spec/trust-gated-swap.md` in the TrustSwap repo) is a real *spec* with a *reference implementation*, not just docs

## Components

### 1. Policy schema + gate function (new in `packages/resolver`)

Add `packages/resolver/src/policy.ts`:

```typescript
import { z } from "zod";
import { TrustTier, type TrustProfile } from "./schema.js";

export const TrustPolicySchema = z.object({
  minTier: TrustTier.default("verified"),
  requireLineage: z.boolean().default(true),
  requireSig: z.boolean().default(true),
  allowSelf: z.boolean().default(true),
});
export type TrustPolicy = z.infer<typeof TrustPolicySchema>;

export const GateDecisionSchema = z.object({
  allow: z.boolean(),
  reason: z.string(),
  profile: z.lazy(() => TrustProfileSchema),
  policy: TrustPolicySchema,
});
export type GateDecision = z.infer<typeof GateDecisionSchema>;

export function gate(
  profile: TrustProfile,
  policy: TrustPolicy,
  callerEns?: string,
): GateDecision;
```

Decision branches (each unit-tested):

| Branch | Condition | Reason string |
|---|---|---|
| Deny: tier below | `tierRank(profile.trustScore) < tierRank(policy.minTier)` | `"tier {actual} below required {minTier}"` |
| Deny: lineage broken | `policy.requireLineage && !profile.manifest.lineageIntact` | `"manifest lineage broken at v{depth}"` |
| Deny: sig invalid | `policy.requireSig && profile.manifest.found && !profile.manifest.signatureValid` | `"manifest signature does not match current ENS owner"` |
| Deny: self disallowed | `!policy.allowSelf && callerEns === profile.ensName` | `"self-resolution not permitted by policy"` |
| Allow | otherwise | `"all gates passed at tier {actual}"` |

`tierRank` is a small internal helper mapping `none < registered < discoverable < verified < full` to integers.

Pure function, no I/O. The caller is responsible for resolving the profile (via `resolve()`) before calling `gate`.

### 2. Signer interface + adapters (new in `packages/resolver`)

Add `packages/resolver/src/wallets/`:

- `index.ts` — defines the `Signer` interface and re-exports the two adapters.
- `local.ts` — viem-based EOA signer (private key → `WalletClient`).
- `namera.ts` — ZeroDev kernel-account signer over `@namera-ai/sdk`.

```typescript
// packages/resolver/src/wallets/index.ts
export interface Batch {
  chainId: number;
  atomic: boolean;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }>;
}

export interface Signer {
  /** Address that signs and submits — EOA address for local, kernel account address for namera. */
  address: `0x${string}`;
  /** Submit one or more batches; returns the broadcast tx (or user-op) hash. */
  execute(batches: Batch[]): Promise<`0x${string}`>;
}

export { createLocalSigner } from "./local.js";
export { createNameraSigner } from "./namera.js";
```

```typescript
// local.ts
export function createLocalSigner(opts: {
  privateKey: `0x${string}`;
  chain: Chain;     // viem chain (e.g. base)
  rpc: string;
}): Signer;
```

```typescript
// namera.ts
export async function createNameraSigner(opts: {
  ownerKeystorePath: string;       // encrypted, local
  sessionKeyPath: string;          // serialized session key on disk
  bundlerUrl: string;              // ERC-4337 bundler (Pimlico/Alchemy)
  chain: Chain;
  rpc: string;
}): Promise<Signer>;
```

Internals (`namera.ts`): read encrypted keystore → recover owner key → `createAccountClient({ type: "ecdsa", … })` → load serialized session key → `createSessionKeyClient(...)` → `execute(batches)` calls `executeTransaction({ batches, clients: [sessionKeyClient] })`. The adapter is a *thin* shim over `@namera-ai/sdk`; no policy installation logic lives here. Policies (call/gas/rate/timestamp) are configured by the application that issues the session key, not by the signer adapter.

The resolver does not perform signer-side ceremonies (kernel-account creation, session-key issuance, keystore encryption). Those are *operator* concerns belonging to whichever application uses the signer — see TrustSwap Phase 0 for the first instance.

### 3. CLI surface: `ensemble gate` (new in `packages/cli`)

Add `packages/cli/commands/gate.ts`:

```bash
ensemble gate <ens> \
  --min-tier <tier>           # default verified
  --require-lineage           # default true
  --require-sig               # default true
  --allow-self                # default true
  --json                      # machine-readable output
```

Behavior: resolves the ENS name via the existing `resolve()`, applies `gate()` with the provided policy, prints the decision (allow/deny + reason + tier breakdown). Exit code: `0` on allow, `1` on deny.

This is the public CLI surface for the new primitive — anyone scripting trust-gated workflows on the CLI uses this. TrustSwap's `tru swap` command will internally call `gate()` directly (not shell out to `ensemble gate`), but the CLI command exists for shell-driven and inspection use cases.

Register in `packages/cli/index.ts` alongside the existing trust/manifest/context commands.

## File layout (additions only)

```
synthesis/
  packages/
    resolver/
      src/
        policy.ts                       NEW
        wallets/
          index.ts                      NEW — Signer interface + Batch type
          local.ts                      NEW — viem EOA adapter
          namera.ts                     NEW — ZeroDev kernel adapter
        index.ts                        UPDATE — export gate, TrustPolicy, GateDecision, Signer, createLocalSigner, createNameraSigner
      package.json                      UPDATE — add @namera-ai/sdk
    cli/
      commands/
        gate.ts                         NEW
        index.ts                        UPDATE — re-export gate command
      index.ts                          UPDATE — register `ensemble gate`
  spec/
    trust-policy.md                     NEW — short spec for the gate decision shape (one-pager)
```

## Build sequence

### Phase A.0 — Prerequisites (~1 hour)

- [ ] `pnpm add @namera-ai/sdk` to `packages/resolver`. Confirm peer-dep resolution against existing `@zerodev/*`, `permissionless`, `viem`.
- [ ] Confirm `~/synthesis-research/namera/` is at the SDK version we just pinned (cross-reference for behavior questions during implementation).
- [ ] Audit `packages/resolver/src/index.ts` and confirm `TrustProfile`, `TrustTier`, `ManifestResult` are exported (they are — see line 9–27). No additional barrel work needed for `policy.ts` to compile.
- [ ] `pnpm -r build` passes — gate before any code lands.

### Phase A.1 — Policy primitive (~half day)

- [ ] Implement `policy.ts` with `gate()` and the schema exports.
- [ ] Unit tests for each decision branch — fixture profiles for tier-below, lineage-broken, sig-invalid, self-swap, and allow. Use Vitest if not already wired; otherwise plain `node:test`.
- [ ] Update `packages/resolver/src/index.ts` to re-export `gate`, `TrustPolicy`, `TrustPolicySchema`, `GateDecision`, `GateDecisionSchema`.
- [ ] No live ENS reads in the gate tests — they take a `TrustProfile` as input. Resolution is the caller's job.

### Phase A.2 — Signer primitive (~full day)

- [ ] Implement `wallets/index.ts` with `Signer` and `Batch` types.
- [ ] Implement `wallets/local.ts` — wraps `viem.WalletClient.sendTransaction`, mapping `Batch[]` to sequential sends (atomic-flag is a no-op for EOA — document that limitation in JSDoc).
- [ ] Implement `wallets/namera.ts` — `createNameraSigner` reading keystore + serialized session key, `execute(batches)` wrapping `executeTransaction`.
- [ ] Update `packages/resolver/src/index.ts` to re-export `Signer`, `Batch`, `createLocalSigner`, `createNameraSigner`.
- [ ] Local signer tested with a viem mocked transport (no real broadcast).
- [ ] Namera signer tested with a fixture-only happy path (mock `executeTransaction`); end-to-end live broadcast tested in TrustSwap Phase 0, not here.

### Phase A.3 — CLI command (~half day)

- [ ] Implement `commands/gate.ts` using `incur` (match the shape of `trust.ts` / `verify.ts`).
- [ ] Register in `packages/cli/commands/index.ts` and `packages/cli/index.ts`.
- [ ] CLI smoke test: `ensemble gate emilemarcelagustin.eth --min-tier verified` against live ENS reads on Base. Verify both allow path (current good name) and deny path (a name with no manifest).
- [ ] `--json` flag emits a parseable `GateDecision` shape.

### Phase A.4 — Spec + ship (~2 hours)

- [ ] `spec/trust-policy.md` — one-page spec describing the gate decision shape, the policy fields, and the convention for downstream consumers (named the same as the function: `gate(profile, policy) → decision`).
- [ ] Update `packages/resolver/README.md` (or create) with one example calling `gate()` and one calling `createLocalSigner` + `signer.execute(...)`.
- [ ] Bump `@synthesis/resolver` to `0.2.0`. Bump `@synthesis/cli` accordingly.
- [ ] Open PR against `main`. Title: `feat(resolver): add gate() primitive and Signer abstraction`. Body includes pointer to `plans/trust-gated-swap.md` as the first downstream consumer.

## Out of scope for this plan

Explicitly *not* in this PR (these belong to TrustSwap):

- Uniswap Trading API client — app-specific
- `ensemble swap` / `tru swap` commands — app-specific
- Daemon mode (`ensemble agent run`) — app-specific
- Site routes (`/swap`, `/agent`) — app-specific
- MCP server — app-specific distribution surface
- Operational ceremonies: kernel-account creation, owner-key keystore encryption, session-key issuance + serialization, account funding — all happen in TrustSwap Phase 0 against the signer adapters this PR ships
- Bundler URL provisioning, `UNISWAP_API_KEY` — TrustSwap deploy concerns

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `@namera-ai/sdk` peer-dep collision with existing `@zerodev/*` versions in resolver | Medium | Phase A.0 install gate. If it collides, pin matching ZeroDev versions before writing the adapter. |
| Namera SDK API drift between this PR and TrustSwap consumption | Medium | Pin exact version in `package.json`; cross-reference `~/synthesis-research/namera/` for the version we pinned. Don't track latest. |
| Gate function over-fits to TrustSwap's needs and isn't actually generic | Low | Keep the decision branches matching the schema fields, not application semantics. If a branch needs application context, it doesn't belong in `gate()` — the caller can layer their own check on top. |
| Signer interface too narrow for future use cases (sponsored gas, paymaster, multi-sig) | Medium | Ship 0.2.x as the minimum viable interface. Promote to 1.0 only after ≥2 consumers (TrustSwap + one other) have integrated. Breaking changes are cheap pre-1.0. |
| CLI `ensemble gate` exit-code convention conflicts with existing commands | Low | Match the convention in `verify.ts` (exit 1 on negative result). Document in `--help`. |

## Success criteria

- `pnpm test` in `packages/resolver` covers all 5 gate decision branches.
- `ensemble gate <name> --min-tier verified` works against a live ENS name on Base.
- TrustSwap can `import { gate, createNameraSigner, type Signer } from "@synthesis/resolver"` and build its `tru swap` command without modifying anything in synthesis.
- The PR description in synthesis links to `plans/trust-gated-swap.md` so reviewers see the motivating downstream consumer.
