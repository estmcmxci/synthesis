# agent-verify fixtures

Frozen offline copies of the live `emilemarcelagustin.eth` deployment, used by `agent-verify.test.ts` and `jcs.test.ts`. **Tests must not hit the network.**

| File | Source | Frozen |
|---|---|---|
| `agent-schema-v1.json` | `bafybeighgfsdllcwlb7uvga5foqonx52vnoryede72jo6k2a4rtj5naq3i/schemas/agent-schema-v1.json` | 2026-05-05 |
| `delegation-policy-schema-v1.json` | same dir CID, `/schemas/...` | 2026-05-05 |
| `delegation-policy-v1.json` | `bafybeicqnxyjsvro7ipmdhhzymtk5y2qbaudzmtgggllt7midikdxkmoxi/policies/delegation-policy-v1.json` | 2026-05-05 |
| `records.json` | canonical tuple in agency repo `deploy/ens-agent/.env.deploy` + `memory/ens-agent-emilemarcelagustin.md` | 2026-05-05 |

`policy-hash` for the frozen `delegation-policy-v1.json` is `0x6f3878cb630f8d16e5f8eac858f8923d15d5475773c1205b97dab0b06b35c114` — the JCS canonicalizer test asserts this exactly. Mismatch ⇒ JCS implementation is wrong.

To re-pin or refresh: bump the policy file in the agency repo (`deploy/ens-agent/`), re-pin via `make pin-policy` and `make pin-schema`, copy the four files back here, and update the table above.
