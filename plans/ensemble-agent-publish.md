# Plan: `ensemble agent publish <ens-name>`

PR #5 of the §7 roadmap. Ports `publish-records.sh` (in `agency/deploy/ens-agent/scripts/`) into a CLI command. Closes the deploy loop with `agent pin` (#49) and `agent verify` (#46): operator path becomes `pin → publish → verify` with no bash and no `.env.deploy`.

This is the first PR in the §7 sequence that mutates mainnet ENS state.

## Scope

### In

- New CLI subcommand `ensemble agent publish <ens-name>`
- Library function `publishAgentRecords(ensName, records, client, options)` from `@synthesis/resolver`
- Pre-broadcast value validation (shared regex set with the records-layer in `agent verify`)
- One multicall transaction by default (improvement over bash's 9 sequential)
- `--no-multicall` falls back to 9 sequential setText txs (matches bash)
- `--legacy-aliases` writes 7 deprecated `agent.<name>_v1` keys (matches bash `EMIT_LEGACY_ALIASES=1`)
- `--from-pin-output` consumes `agent pin --format json` output by named field (`schemaUri`, `delegationUri`, `policyHash`) — fail-loud when a referenced field is missing
- Per-key diff against on-chain values (read-only, shown in plan output)
- `--ledger` for hardware-wallet signing
- Human + `--format json` output

### Out (separate PRs)

- Key generation / kernel issuance (PR #3: `ensemble agent issue`)
- Session-key rotation (PR #6: `ensemble agent rotate`)
- Site explorer route (#44)

## CLI surface — `--broadcast` opt-in only (no `--dry-run` flag)

```
# plan-only: prints calldata + per-key diff, exits 0. NO BROADCAST.
ensemble agent publish emilemarcelagustin.eth \
  --schema ipfs://... --runtime-pubkey 0x... --kernel-wallet 0x... \
  --agent-endpoint-web https://... --delegation ipfs://... \
  --policy-hash 0x... --policy-version v1

# pull schema/delegation/policy-hash from a pin output
ensemble agent publish emilemarcelagustin.eth \
  --from-pin-output ./pin.json \
  --runtime-pubkey 0x... --kernel-wallet 0x... \
  --agent-endpoint-web https://... --policy-version v1

# explicitly broadcast
ensemble agent publish emilemarcelagustin.eth ... --broadcast

# 9 sequential setText txs (matches bash)
ensemble agent publish emilemarcelagustin.eth ... --broadcast --no-multicall

# also write 7 deprecated agent.<name>_v1 keys
ensemble agent publish emilemarcelagustin.eth ... --broadcast --legacy-aliases
```

| Flag | Default | Meaning |
|---|---|---|
| `--broadcast` | off | Send transactions. Without this flag, no state is mutated. |
| `--from-pin-output <path>` | — | Repeatable. Reads `schemaUri`/`delegationUri`/`policyHash` as NAMED FIELDS. |
| `--no-multicall` | off | Fall back to 9 sequential setText transactions (bash compatibility) |
| `--legacy-aliases` | off | Write 7 deprecated `agent.<name>_v1` keys |
| `--ledger` | off | Sign via Ledger |
| `--format json` | — | Emit `PublishPlan` JSON |

There is **no `--dry-run` flag**. Plan-only mode is the absence of `--broadcast`. A regression test in `agent-publish.test.ts` enforces that the schema never grows a `dryRun` option.

## Decisions locked in advance

1. **`--broadcast` is the only opt-in.** Inverts the bash's `DRY_RUN=1` env-var default into a flag-driven explicit opt-in. There is no `--dry-run` flag — its absence IS the default. Test `agent-publish — index.ts schema does not declare --dry-run` is the regression fence.
2. **`--from-pin-output` reads `schemaUri` and `delegationUri` as NAMED FIELDS.** No relpath pattern-matching at the publish layer. The amendment to PR #49's `PinResult` shape (precursor commit on this branch) added these named fields; the publish command consumes them. Operator gets a fail-loud error if the pin output is missing a field they're relying on.
3. **One multicall transaction by default.** The bash fires 9 sequential `setText` transactions. The CLI uses `multicall(bytes[])` (already in the resolver ABI per `contracts.ts:108`). One signature, one transaction, atomic. `--no-multicall` falls back to bash behavior for older resolvers.
4. **Pre-broadcast validation via the same regex set the verifier uses.** The records-layer regex set in `agent verify` (#46) is the source of truth; `publishAgentRecords` calls the same checks before encoding any transaction. `--runtime-pubkey 0xnotanaddress` exits 2 instead of broadcasting a malformed record.
5. **Library is transport-agnostic.** `publishAgentRecords` doesn't pull in viem-wallet, dotenv, or Ledger code. The CLI injects a `send(calldata, target) → txHash` callback. Keeps the resolver package free of CLI deps and lets tests exercise broadcast paths with stubs.

## Files

| File | Status |
|---|---|
| `packages/cli/commands/agent-pin.ts` | edit — precursor: add `delegationUri` + `schemaUri` to `PinResult` |
| `packages/cli/commands/agent-pin.test.ts` | edit — precursor: +2 tests for the new fields |
| `packages/resolver/src/utils/agent-publish.ts` | new — validation, records-array builder, calldata encoder, multicall builder, `publishAgentRecords` orchestrator, `diffAgainstChain` |
| `packages/resolver/src/utils/agent-publish.test.ts` | new — 17 unit tests, mocked viem client |
| `packages/resolver/src/index.ts` | edit — re-export |
| `packages/cli/commands/agent-publish.ts` | new — CLI presenter, `--from-pin-output` parser, plan printer with per-key diff |
| `packages/cli/commands/agent-publish.test.ts` | new — 8 unit tests, regression fence against `--dry-run` |
| `packages/cli/commands/index.ts`, `packages/cli/index.ts` | edit — wire `agent publish` |
| `plans/ensemble-agent-publish.md` | new — this doc |

LOC estimate: ~900.

## Acceptance

```bash
pnpm install && pnpm -r build && pnpm -r test
node packages/cli/dist/index.js agent publish --help
# Plan-only on the live name, no broadcast — should produce a no-op diff
node packages/cli/dist/index.js agent publish emilemarcelagustin.eth \
  --schema ipfs://bafybeighgfsdllcwlb7uvga5foqonx52vnoryede72jo6k2a4rtj5naq3i/schemas/agent-schema-v1.json \
  --runtime-pubkey 0x8973B6897554017d208DBeE2Ef5Fb8Fb046A6aEB \
  --kernel-wallet 0xEc0d3C782C6087235Ab16d8c4d4188d10DFD796A \
  --agent-endpoint-web https://xxje1rfb.agents.pinata.cloud/app \
  --delegation ipfs://bafybeicqnxyjsvro7ipmdhhzymtk5y2qbaudzmtgggllt7midikdxkmoxi/policies/delegation-policy-v1.json \
  --policy-hash 0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114 \
  --policy-version v1
# all 9 records show as `(unchanged)` — confirms encoder matches what's already on-chain
```
