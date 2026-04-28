# Trust Policy + Gate Convention (Draft)

A composable convention for turning a `TrustProfile` (the output of any TRL-style resolver) into a typed `allow / deny` decision against a configurable policy. Reference implementation: [`@synthesis/resolver`](../packages/resolver) (`gate()` and `TrustPolicy`).

## Abstract

This draft standardizes a minimal, deterministic **policy + gate function** that maps `(profile, policy) → decision`. The goal is a stable surface that any consumer of trust resolution data — CLIs, server actions, MCP tools, long-lived agents — can compose against without each app re-inventing the same five decision branches. The function is pure (no I/O), so it is unit-testable in isolation and safely cacheable.

## Motivation

A `TrustProfile` is a noun. Acting on it requires turning it into a verb — a decision. Without a shared convention, every downstream app reinvents:

1. *What "trusted enough" means* (which tier? lineage required? signature required?)
2. *How to express the decision* (boolean? object? error?)
3. *How to communicate refusal* (reason string format, error semantics)

This draft fixes those three questions with the smallest viable surface, so different apps can substitute trust providers, swap signers, or compose policies without breaking integrators that consume the decision.

## Specification

The keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

### 1. The `TrustPolicy` schema (normative)

| Field | Type | Default | Semantics |
|---|---|---|---|
| `minTier` | `TrustTier` enum | `"verified"` | Minimum trust tier required. `none < registered < discoverable < verified < full`. |
| `requireLineage` | `boolean` | `true` | When true, profile MUST have `manifest.lineageIntact === true` to allow. |
| `requireSig` | `boolean` | `true` | When true AND a manifest exists, `manifest.signatureValid` MUST be true. |
| `allowSelf` | `boolean` | `true` | When false, the caller MUST NOT be the same ENS name as the resolved profile. |

Implementations MUST treat undefined fields as the defaults above. The defaults represent the minimum-safe policy — adopters opt out of checks explicitly.

### 2. The `GateDecision` shape (normative)

```typescript
interface GateDecision {
  allow: boolean;     // the verdict
  reason: string;     // human-readable; canonical strings below
  profile: TrustProfile;  // the input profile (echoed for auditability)
  policy: TrustPolicy;    // the input policy (echoed for auditability)
}
```

Echoing `profile` and `policy` MUST happen even on deny — the decision is self-describing for after-the-fact audit logs without requiring the auditor to re-resolve.

### 3. The `gate` function contract (normative)

```typescript
function gate(
  profile: TrustProfile,
  policy: TrustPolicy,
  callerEns?: string,
): GateDecision;
```

Implementations MUST:

- Be **pure** — no I/O, no async, no side effects, deterministic for identical inputs.
- Apply branches in the order specified in §4 (first-match-wins).
- Echo `profile` and `policy` verbatim in the returned `GateDecision`.

Implementations MUST NOT throw on valid input. Invalid input (e.g. a malformed `callerEns` that fails ENS normalization) MAY throw.

### 4. Decision branches (normative — first match wins)

| Order | Branch | Condition | `reason` |
|---|---|---|---|
| 1 | Deny: missing caller identity | `!policy.allowSelf && !callerEns` | `"self-resolution check requires callerEns when allowSelf is false"` |
| 2 | Deny: self disallowed | `!policy.allowSelf && normalize(callerEns) === normalize(profile.ensName)` | `"self-resolution not permitted by policy"` |
| 3 | Deny: tier below | `tierRank(profile.trustScore) < tierRank(policy.minTier)` | `` `tier ${actual} below required ${minTier}` `` |
| 4 | Deny: signature invalid | `policy.requireSig && profile.manifest.found && !profile.manifest.signatureValid` | `"manifest signature does not match current ENS owner"` |
| 5 | Deny: lineage broken | `policy.requireLineage && !profile.manifest.lineageIntact` | `` `manifest lineage broken at v${depth}` `` |
| 6 | Allow | otherwise | `` `all gates passed at tier ${tier}` `` |

**Notes:**
- Branch 1 is **fail-closed**. When a policy opts out of `allowSelf`, the gate cannot determine self-equality without `callerEns` — silently skipping the check would bypass an explicitly-requested safety control.
- Branch 2 normalizes both names per [ENSIP-15](https://docs.ens.domains/ensip/15) before equality. Without normalization, `Alice.eth` would bypass an `allowSelf: false` gate against a profile resolved from `alice.eth`.
- Branch 4 guards on `manifest.found` so profiles without a manifest don't fail the signature check vacuously. Branch 5 (lineage) does not — `lineageIntact` defaults to `false` for missing manifests by convention, so requiring lineage requires *having* a manifest.

### 5. Tier ranking (normative)

```
none = 0
registered = 1
discoverable = 2
verified = 3
full = 4
```

Strictly ordered. The set is closed — implementations MUST NOT introduce new tiers without a spec revision.

### 6. CLI exit-code convention (recommended)

CLI consumers of `gate()` SHOULD adopt:

| Exit code | Meaning |
|---|---|
| `0` | `decision.allow === true` |
| `1` | `decision.allow === false` |

This lets shell pipelines branch on a gate decision without parsing output. Reference implementation: `ensemble gate <name>` in `@synthesis/cli`.

## Reference implementation

- **Library:** [`@synthesis/resolver`](../packages/resolver) — exports `gate`, `TrustPolicy`, `TrustPolicySchema`, `GateDecision`, `GateDecisionSchema`. ~90 LoC + 12 unit tests.
- **CLI:** `ensemble gate <ens>` in [`@synthesis/cli`](../packages/cli) — pretty-prints the decision, exits per §6, supports `--format json` for machine-readable output.

## Adoption

Trust providers other than the synthesis Trust Resolution Layer MAY adopt this convention by producing a `TrustProfile`-shaped object and reusing the same `gate()` semantics. The decision shape and branch order are independent of *how* a profile was resolved — different providers (TRL, Signet, future personhood + reputation systems) can compose against the same policy primitive.

Application authors building on TRL — e.g. trust-gated payment tools, agent-to-agent coordination, gated bridges — SHOULD use this primitive directly rather than implementing per-app gating logic. A single canonical implementation prevents drift across the ecosystem.

## Status

Draft. Lives in this repo while the reference implementation matures. If adoption extends beyond the Synthesis project, a future revision MAY pitch this as an ENSIP.

## See also

- `plans/trl-policy-and-signers.md` — execution plan that produced the reference implementation
- `plans/trust-gated-swap.md` — first downstream consumer (trust-gated Uniswap settlement)
- [ENSIP-15: ENS Name Normalization](https://docs.ens.domains/ensip/15)
