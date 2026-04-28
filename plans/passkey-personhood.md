# Passkey Personhood — Extend Layer 0 with WebAuthn Signal

## Context

Currently, `resolvePersonhood()` queries AgentBook on Base + World Chain for a World ID nullifier hash. This is binary: `verified: true` or `verified: false`. Most users haven't scanned their retina — passkey verification covers that gap while preserving the distinction between tiers.

## Goal

Extend `PersonhoodResult` with a `level` field expressing three distinct signals:

- **orb** — World ID biometric, unique (current behavior)
- **passkey** — device-bound WebAuthn biometric, not unique
- **none** — no human signal

## Schema Changes

In `packages/resolver/src/schema.ts`, update `PersonhoodResultSchema`:

```typescript
export const PersonhoodLevel = z.enum(['orb', 'passkey', 'none']);
export type PersonhoodLevel = z.infer<typeof PersonhoodLevel>;

export const PersonhoodResultSchema = z.object({
  verified: z.boolean(),
  level: PersonhoodLevel,                          // NEW
  nullifierHash: z.string().nullable(),
  network: AgentBookNetwork.nullable(),
  agentBookAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable(),
  passkeyCredentialId: z.string().nullable(),      // NEW — base64url credential ID
});
```

## Layer 0 Changes

In `packages/resolver/src/layers/personhood.ts`, update the resolution flow:

**Step 1 — AgentBook (unchanged):** query Base + World Chain. If `humanId !== 0n`, return `level: 'orb'`, `verified: true`.

**Step 2 — Passkey check (new):** if AgentBook returns nothing, check whether the ENS name has a `passkey-attestation` text record. The value should be a JSON object:

```json
{
  "credentialId": "<base64url>",
  "publicKey": "<base64url COSE key>",
  "rpId": "<relying party domain>",
  "attestedAt": "<unix timestamp>"
}
```

If the record is present and the `rpId` matches an ENS-owned domain (same domain verification logic as `resolveSkill()`), return `level: 'passkey'`, `verified: true`, `passkeyCredentialId` set.

**Step 3 — Fallback:** return `level: 'none'`, `verified: false`.

## Trust Tier Impact

Personhood is currently an enrichment signal, not a tier gate (per `computeTrustTier()` in `resolve.ts`). That should not change. The `level` field surfaces the distinction for consumers who want to gate on it — the TRL exposes it, but doesn't enforce a policy.

## CLI Changes

Update `ensemble trust <name>` output in `packages/cli/commands/trust.ts` to display the personhood level:

```
→ Personhood:  ✓  orb     (World ID, nullifier: 0x3a...)
→ Personhood:  ~  passkey (device-bound, rpId: emilemarcelagustin.eth.limo)
→ Personhood:  ✗  none
```

### New CLI Command

Add `ensemble personhood set-passkey <name>` to write the `passkey-attestation` text record. It should:

- Accept `--credential-id`, `--public-key`, `--rp-id` as flags
- Construct the JSON payload
- Call `setTxtCmd()` with key `passkey-attestation`
- Confirm the write with the user before submitting

## Files to Touch

- `packages/resolver/src/schema.ts` — add `PersonhoodLevel`, extend `PersonhoodResultSchema`
- `packages/resolver/src/layers/personhood.ts` — add passkey check step
- `packages/resolver/src/index.ts` — export `PersonhoodLevel`
- `packages/cli/commands/personhood.ts` — add `set-passkey` subcommand, update trust display
- `packages/cli/index.ts` — register new command

## Deferred

- WebAuthn ceremony UI — belongs in the site at `/wallet` or a standalone onboarding page
- Signature verification of the passkey assertion at resolution time — ENS text record set by the name owner is sufficient attestation for now
- Revocation
