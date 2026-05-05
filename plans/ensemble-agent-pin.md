# Plan: `ensemble agent pin <dir>`

PR #4 of the §7 roadmap. Ports `pin-schema.sh` + `pin-policy.sh` (in
`agency/deploy/ens-agent/scripts/`) into a single CLI command. After
this lands, the deploy path is reachable from the synthesis CLI without
the agency-repo bash scripts.

## Scope

### In

- New CLI subcommand `ensemble agent pin <dir>`
- Library function `pinDirectory(files, options)` exported from `@synthesis/resolver`
- Multipart upload to Pinata's `pinFileToIPFS`
- `pin-root/` synthetic prefix replicated (Pinata directory-shape requirement)
- `--policy <relpath>` computes `keccak256(JCS(file))` via the resolver's
  existing canonicalizer — same path the verifier uses
- `--policy -` reads policy bytes from stdin (CI without temp files)
- Post-pin gateway-resolution probe (default on)
- Human + `--format json` output

### Out (separate PRs)

- ENS record writes (`ensemble agent publish` — PR #5)
- Key generation / kernel issuance (`ensemble agent issue` — PR #3)
- Session-key rotation (`ensemble agent rotate` — PR #6)
- Site explorer route (#44)

## CLI surface

```
ensemble agent pin <dir>
ensemble agent pin <dir> --policy policies/delegation-policy-v1.json
cat policy.json | ensemble agent pin <dir> --policy -
ensemble agent pin <dir> --metadata-name agent-policy-v1
ensemble agent pin <dir> --gateway my-gw.pinata.cloud
ensemble agent pin <dir> --no-verify --format json
```

| Flag | Default | Meaning |
|---|---|---|
| `--policy <relpath \| ->` | — | Compute `policyHash` from this file (relpath in `<dir>` or `-` for stdin) |
| `--metadata-name` | `basename(dir)` | Pinata `pinataMetadata.name`. Stable, not timestamped |
| `--gateway` | `gateway.pinata.cloud` | Used only for the post-pin verification probe |
| `--no-verify` | off | Skip the gateway probe |
| `--format json` | — | Emit `PinResult` JSON |
| `--explain` | off | Print all per-file IPFS URIs |

Env: `PINATA_JWT` (required; same name as the agency scripts).

Exit codes: 0 success, 1 pin / verify failure, 2 input error.

## Decisions locked in advance

- **Raw fetch, no `@pinata/sdk`.** One endpoint, one POST. Adding a top-level dep for that is a dep tax we'd carry through every `@synthesis/resolver` consumer. The bash scripts use raw curl.
- **`--policy -` reads stdin.** Works in CI without temp files.
- **`--metadata-name` defaults to a stable string (`basename(dir)`)** — matches the bash. Re-pinning is idempotent on Pinata's side; a timestamped default would clutter the operator's pin list.
- **`pin-root/` synthetic prefix is replicated.** Without it Pinata flattens the directory.
- **No `.env.deploy` mutation.** That's the bash script's job.
- **Post-pin gateway probe defaults on.** Surfaces transient pin failures immediately.
- **Single-file directory pins are rejected.** Pinata flattens them regardless of the synthetic root.

## Round-trip integration test

```bash
INTEGRATION_TESTS=1 PINATA_JWT=... pnpm -r test
```

Pins a throwaway directory, re-fetches the policy via the resolver's gateway race, and asserts `keccak256(JCS(fetched-bytes)) === policyHash` returned by `agent pin`. Closes the loop between pin and verify.

## Acceptance

```bash
pnpm install && pnpm -r build && pnpm -r test
PINATA_JWT=... node packages/cli/dist/index.js agent pin /Users/oakgroup/webdev/agency/deploy/ens-agent/spec/ipfs --policy policies/delegation-policy-v1.json --format json
# expects policyHash == 0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114
```
