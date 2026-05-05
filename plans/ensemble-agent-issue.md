# Plan: `ensemble agent issue <alias>`

PR #3 of the §7 roadmap. Bootstraps a fresh agent's wallet stack
(keystore + smart-account + session-key) via the `@namera-ai/sdk`
programmatic APIs — no shell-out to the agency repo's `external/namera`
CLI. Closes #52.

## Scope

### In

- New CLI subcommand `ensemble agent issue <alias>`
- Library functions exported from `@synthesis/resolver`:
  - `issueKeystore` — Web3 V3 keystore (AES-256-GCM, scrypt)
  - `issueSmartAccount` — derives kernel address via SDK (no broadcast)
  - `issueSessionKey` — fresh signer + policies → serialized blob (no broadcast)
  - `readSessionKeyForRuntime` — runtime-side reload helper for `createNameraSigner`
- Three artifacts written to `~/.synthesis/{keystores,smart-accounts,session-keys}/<alias>.json`
- Alias-keyed step-skip idempotency (re-run is a no-op)

### Out (separate PRs)

- `agent publish --from-issue-output <file>` — small follow-up, output shape locked here
- Session-key rotation (PR #6: `agent rotate`)
- Multi-chain session-key issuance
- Site explorer route (#44)

## Decisions locked in advance

1. **Option (a) — `@namera-ai/sdk` programmatic APIs.** The SDK exports `createEcdsaAccountClient` and `createEcdsaSessionKey`; both produce artifacts locally without broadcasting. No shell-out to `external/namera/apps/cli`. No new top-level deps.
2. **Hardcoded env-var name `SYNTHESIS_KEYSTORE_PASSWORD`.** No `--password-env` flag (double indirection). Operator who wants a different name pipes: `SYNTHESIS_KEYSTORE_PASSWORD=$THEIR_VAR ensemble agent issue <alias>`. A regression test enforces the schema never grows a `--password-env` option.
3. **No `SYNTHESIS_SESSION_KEY_PASSWORD`.** Generate a random per-session-key inner passphrase inside `issueSessionKey`, store it alongside the encrypted blob in the same JSON. Decoupled from the keystore password — leaking one doesn't compromise the other. Runtime adapter reads both without operator involvement.
4. **AES-256-GCM cipher (locked).** Web3 V3 spec lists CTR + a separate keccak256 MAC; GCM is authenticated and modern, no separate-MAC downgrade-bug surface.
5. **`chainId` is source-of-truth in `IssueResult`; `chain` is a human label.** Both fields appear in output. Consumers MUST read `chainId`. If a future release adds a chain whose label drifts (e.g. `base-mainnet` → `base`), `chainId` is stable.
6. **Web3 V3 keystore JSON format.** Importable into geth, ethers, viem. The Namera CLI uses a proprietary format; we don't re-use it. Cross-CLI compat is a non-goal.

## CLI surface

```
ensemble agent issue <alias>
ensemble agent issue bravo --chain base
ensemble agent issue bravo --chain base-sepolia --ttl-hours 24
ensemble agent issue bravo --rpc <url> --bundler <url>
ensemble agent issue bravo --gas-cap-wei 1000000000000000 --index 0
ensemble agent issue bravo --format json
```

Env: `SYNTHESIS_KEYSTORE_PASSWORD` (required). Hardcoded name.

Exit codes: 0 success, 1 SDK/IO failure, 2 missing env or invalid input.

## Output shape (locked, maps 1:1 to `agent publish` flags)

```json
{
  "alias": "bravo",
  "kernelWallet": "0x...",         // → publish --kernel-wallet
  "runtimePubkey": "0x...",        // → publish --runtime-pubkey
  "kernelVersion": "0.3.3",
  "chain": "base",                 // human label, may drift
  "chainId": 8453,                 // source-of-truth
  "keystorePath": "/Users/.../keystores/bravo.json",
  "smartAccountPath": "/Users/.../smart-accounts/bravo.json",
  "sessionKeyPath": "/Users/.../session-keys/bravo.json",
  "ttlHours": 168,
  "validUntil": "2026-05-12T..."
}
```

## Files

| File | Status |
|---|---|
| `packages/resolver/src/wallets/keystore.ts` | new — Web3 V3 / AES-256-GCM |
| `packages/resolver/src/wallets/keystore.test.ts` | new — 8 round-trip + tampering tests |
| `packages/resolver/src/wallets/namera-issue.ts` | new — three issuance fns + `readSessionKeyForRuntime` |
| `packages/resolver/src/wallets/namera-issue.test.ts` | new — 9 tests, SDK calls injected |
| `packages/resolver/src/index.ts` | edit — re-export |
| `packages/cli/commands/agent-issue.ts` | new — CLI presenter |
| `packages/cli/commands/agent-issue.test.ts` | new — 4 tests including hardcoded-env-var fence + IssueResult shape lock |
| `packages/cli/commands/index.ts`, `packages/cli/index.ts` | edit |
| `plans/ensemble-agent-issue.md` | new |

LOC: ~1100.

## Acceptance

```bash
pnpm install && pnpm -r build && pnpm -r test
SYNTHESIS_KEYSTORE_PASSWORD=test123 \
  node packages/cli/dist/index.js agent issue bravo --format json
# emits IssueResult JSON; files appear under ~/.synthesis/{keystores,smart-accounts,session-keys}/bravo.json
SYNTHESIS_KEYSTORE_PASSWORD=test123 \
  node packages/cli/dist/index.js agent issue bravo
# second run: each step reports "(already exists)"
```

End-to-end live transcript on a fresh ENS name (NOT `emilemarcelagustin.eth`) gets captured in the PR description: `issue → pin → publish → verify`, all via CLI, no bash, no `.env.deploy` editing.
