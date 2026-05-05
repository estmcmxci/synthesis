# Plan: `ensemble agent rotate <alias> --ens <ens-name>`

PR #6 of the §7 roadmap. Last deploy-lifecycle primitive. Rotates the
active session key + bumps the policy version on an ENS-bound agent.
After this lands the lifecycle is `issue → pin → publish → verify →
rotate`, all CLI-native, no bash anywhere.

## Scope

### In

- New CLI subcommand `ensemble agent rotate <alias> --ens <ens-name>`
- Library functions exported from `@synthesis/resolver`:
  - `bumpPolicy(currentDoc, args)` — pure (no IO) — produces a v2+ doc
    from a v1+ input, carries forward all non-rotated fields verbatim
  - `nextMajorVersion(current)` — `"v1" → "v2"`, `"v1.2" → "v2"`
  - `rotateAgent(args)` — orchestrates the 4 procedure steps via
    composition over #49's `pinDirectory`, #51's `publishAgentRecords`,
    and #53's `issueSessionKey`
- Plan-only by default (`--broadcast` is the only mutation opt-in,
  matches #51 convention)

### Out (intentional)

- **Onchain `revokeSessionKey` call** — not invoked. TRL semantic:
  once `runtime-pubkey` no longer matches the old key, verifiers must
  reject. On-chain revoke is gas the operator can pay later via a
  `--revoke-onchain` follow-up flag.
- **Owner-key rotation** — different ceremony (new keystore + new
  smart-account + full re-issuance). Out of scope.
- **Policy-semantic changes** — rotation only changes `version`,
  `active-session-key.address`, `issued-at`, `ttl-hours`. Modifying
  `delegators` / `scope` / `permitted-message-classes` is a separate
  spec change.
- **Site explorer route (#44)** — last remaining open issue after this
  lands.

## Decisions locked

1. **Filename convention `<alias>-policy-v<N>.json` where N is the new
   on-chain version** (Codex amendment 1). NOT a previous-suffix
   counter. Filesystem layout mirrors published state. The
   `RotateResult` field is named `newSessionKeyArtifact` (not
   `newAlias` — disambiguates from the issue-side base alias).
2. **Same env-var convention as `agent publish` (#51)**: `ENS_PRIVATE_KEY`
   for non-Ledger signing, `--ledger` for hardware-wallet path. No
   forked env-var name. Wallet-security note: project signer is the
   manager EOA `0xeb0A…022`, not estmcmxci.eth — see
   `synthesis-wallet-security.md` memory.
3. **Live acceptance must include a `--broadcast` rotation** (Codex
   amendment 3). Plan-only is insufficient because step 4 of the
   procedure (multicall publish) goes unverified. Throwaway agent on a
   fresh ENS name is the preferred target.
4. **`bumpPolicy` is pure** (Codex amendment 4). Caller passes
   `issuedAt` explicitly — no module-eval `Date.now()`. A purity test
   asserts byte-identical JCS canonical bytes across two calls with
   the same inputs.
5. **No on-chain revoke** (Codex amendment 5). Documented in both the
   issue and PR body. Belt-and-suspenders revoke is a follow-up flag.
6. **`--broadcast` is the only mutation opt-in** (matches #51).
   Regression test fences off `--dry-run`.

## CLI surface

```
ensemble agent rotate <alias> --ens <ens-name>                                # plan-only
ensemble agent rotate <alias> --ens <ens-name> --broadcast                     # send
ensemble agent rotate <alias> --ens <ens-name> --policy-version v3             # explicit bump
ensemble agent rotate <alias> --ens <ens-name> --ttl-hours 24                  # short-lived
ensemble agent rotate <alias> --ens <ens-name> --rpc <alchemy>                 # required for SDK
ensemble agent rotate <alias> --ens <ens-name> --ipfs-gateway <url>            # repeatable
ensemble agent rotate <alias> --ens <ens-name> --ledger                        # hardware-wallet sign
ensemble agent rotate <alias> --ens <ens-name> --format json
```

Env: `SYNTHESIS_KEYSTORE_PASSWORD` (always — owner key decrypt),
`PINATA_JWT` (always — pin the new policy doc), `ENS_PRIVATE_KEY` (only
for `--broadcast`, OR `--ledger`).

Exit codes: 0 success, 1 SDK/IO/broadcast failure, 2 missing env or
invalid input.

## Output shape (locked)

```ts
interface RotateResult {
  ensName: string;
  alias: string;                   // base alias passed by operator
  newSessionKeyArtifact: string;   // e.g. "alpha-policy-v2"
  fromVersion: string;             // read from on-chain
  toVersion: string;
  fromRuntimePubkey: string;
  toRuntimePubkey: string;
  newPolicy: { hash: string; uri: string; version: string };
  publishPlan: PublishPlan;        // re-uses #51's shape; 4 records changed
  broadcast: boolean;
}
```

## Files

| File | Status |
|---|---|
| `packages/resolver/src/wallets/policy-bump.ts` | new — `bumpPolicy` + `nextMajorVersion` |
| `packages/resolver/src/wallets/policy-bump.test.ts` | new — 11 tests including the purity fence |
| `packages/resolver/src/wallets/rotate.ts` | new — `rotateAgent` orchestrator |
| `packages/resolver/src/wallets/rotate.test.ts` | new — 9 tests (mocked SDK + IPFS + pin + publish) |
| `packages/resolver/src/index.ts` | edit — re-export |
| `packages/cli/commands/agent-rotate.ts` | new — CLI presenter |
| `packages/cli/commands/agent-rotate.test.ts` | new — 6 tests including env-var locks + filename-convention fence |
| `packages/cli/commands/index.ts`, `packages/cli/index.ts` | edit |
| `plans/ensemble-agent-rotate.md` | new |

LOC: ~1100.

## Acceptance

```bash
pnpm install && pnpm -r build && pnpm -r test
SYNTHESIS_KEYSTORE_PASSWORD=... PINATA_JWT=... \
  node packages/cli/dist/index.js agent rotate <alias> --ens <ens-name> \
       --rpc <alchemy-base>
# plan-only: prints version-bump diff + 4-record multicall plan

SYNTHESIS_KEYSTORE_PASSWORD=... PINATA_JWT=... ENS_PRIVATE_KEY=... \
  node packages/cli/dist/index.js agent rotate <alias> --ens <ens-name> \
       --rpc <alchemy-base> --broadcast
# broadcasts; verifies via `agent verify <ens-name>` post-receipt
```

End-to-end live transcript on a throwaway agent (fresh ENS name) gets
captured in the PR body: `issue → pin → publish → verify → rotate
--broadcast → verify` proves the full lifecycle.
