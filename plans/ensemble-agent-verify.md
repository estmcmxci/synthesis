# Plan: `ensemble agent verify <ens-name>`

First slice of the Ensemble-CLI-as-deploy-tool path. Ports the five-step
ENSIP-64 agent verification flow into a generic CLI command + library
function so any third-party verifier (or the synthesis explorer route, when
that ships) can assert that a signed action originated from an ENS-bound
agent operating within its published policy.

This PR ships **verification only** — no key generation, no IPFS pinning,
no record publishing.

## Scope

### In

- New CLI subcommand `ensemble agent verify <ens-name>`
- Library function `verifyAgentIdentity(ensName, options)` exported from `@synthesis/resolver`
- IPFS doc fetch with multi-gateway race
- RFC 8785 JCS canonicalization + `keccak256`
- JSON-Schema 2020-12 validation against the agent + delegation-policy schemas
- HTTP `/health` probe; optional `/sign` challenge with `--probe-sign`
- EIP-191 signer recovery; equality assertion against `runtime-pubkey`
- Human and `--format json` output
- Stable `AgentVerifyErrorCode` enum per layer

### Out (separate PRs)

- ERC-8004 trust-tier wiring for `ensemble trust` (#43)
- `ensemble agent issue / pin / publish / rotate`
- Synthesis explorer route at `/agent/<ens-name>` (#44)

## CLI surface

```
ensemble agent verify emilemarcelagustin.eth
ensemble agent verify emilemarcelagustin.eth --probe-sign
ensemble agent verify emilemarcelagustin.eth --format json
ensemble agent verify emilemarcelagustin.eth --rpc https://eth.llamarpc.com
ensemble agent verify emilemarcelagustin.eth --ipfs-gateway https://my-gw/ipfs/ --ipfs-gateway https://w3s.link/ipfs/
```

| Flag | Default | Meaning |
|---|---|---|
| `--probe-sign` | off | POST a challenge to `<endpoint>/sign`, recover signer, assert equality with `runtime-pubkey` |
| `--ipfs-gateway` | w3s.link, gateway.pinata.cloud, cloudflare-ipfs.com, ipfs.io | Repeatable; first 200 wins |
| `--rpc` | `$ETH_RPC_URL` or `https://eth.drpc.org` | ENS-mainnet RPC URL |
| `--timeout` | 10000 | Per-network-call timeout (ms) |
| `--format json` | — | Emit structured `AgentVerifyResult` on stdout |
| `--explain` | off | Print debug detail per layer |

## Layered checks

1. **Records** — read 9 ENSIP-64 keys, assert presence + regex-typed values
2. **Schema** — fetch + parse `agent-schema-v1.json`, validate the records doc
3. **Integrity** — `keccak256(JCS(policy-doc)) == policy-hash`
4. **Binding** — `policy.active-session-key.address == runtime-pubkey`; kernel + ens-name match
5. **Liveness** — `GET <endpoint>/health` returns 200
6. **Signature** *(optional, `--probe-sign`)* — POST `{nonce, issuedAt, verifierId}`, recover EIP-191 signer

Exit codes: 0 verified, 1 layer failure, 2 input error.

## Files

| File | Status |
|---|---|
| `packages/resolver/src/layers/agent-verify.ts` | new — core orchestrator + `AgentVerifyErrorCode` enum |
| `packages/resolver/src/layers/agent-verify.test.ts` | new — 9 unit tests, all offline against frozen fixtures |
| `packages/resolver/src/utils/jcs.ts` | new — RFC 8785 JCS |
| `packages/resolver/src/utils/jcs.test.ts` | new — RFC 8785 fixtures + on-chain hash assertion |
| `packages/resolver/src/utils/agent-schema-validator.ts` | new — hand-rolled JSON-Schema 2020-12 subset |
| `packages/resolver/src/utils/ipfs.ts` | edit — adds `fetchIpfsRaw` race helper, preserves existing fetchers |
| `packages/resolver/src/index.ts` | edit — re-export verifier API |
| `packages/resolver/test/fixtures/agent-verify/` | new — frozen schemas + policy + records, no network |
| `packages/cli/commands/agent-verify.ts` | new — CLI presenter + `formatResult` + `exitCodeFor` |
| `packages/cli/commands/agent-verify.test.ts` | new — 5 unit tests (output shape + exit codes) |
| `packages/cli/commands/index.ts` | edit — barrel export |
| `packages/cli/index.ts` | edit — register `agent verify` subcommand |

## Decisions on the §8 open questions

1. **Sub-command grouping pattern** — used the existing incur sub-command group (`agent.command("verify", …)` then `cli.command(agent)`); same shape as the existing `agent register / link / info`.
2. **Validator** — hand-rolled. Synthesis pulls no Ajv (transitive or direct), and zod isn't a JSON-Schema 2020-12 validator. ~120 LOC covers the keywords used by the agent + delegation-policy schemas.
3. **IPFS gateways** — public gateway list (w3s.link, gateway.pinata.cloud, cloudflare-ipfs.com, ipfs.io). Caller can override with repeatable `--ipfs-gateway`. First-200-wins race via `Promise.any`.
4. **Stable error-code enum** — yes, `AgentVerifyErrorCode` enum is defined and surfaced in JSON output for every layer.
5. **`probe-sign` envelope** — `{ nonce: 0x<32 hex>, issuedAt: ISO8601, verifierId: "ensemble-cli/agent-verify@v1" }`. Daemon signs `JCS(envelope)` as the EIP-191 message.

## Acceptance

```bash
pnpm install
pnpm -r build
pnpm -r test
node packages/cli/dist/index.js agent verify emilemarcelagustin.eth
node packages/cli/dist/index.js agent verify emilemarcelagustin.eth --format json
```

Reference deployment: `emilemarcelagustin.eth` (live, all 9 ENSIP-64 records on mainnet).
