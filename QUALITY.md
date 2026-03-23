# Quality — Synthesis

Per-domain quality grades and known debt. Update this as the project evolves.

## Quality Grades

| Domain | Grade | Notes |
|---|---|---|
| CLI — ENS read commands (resolve, profile, available, list) | B | Working on mainnet + sepolia, needs edge case testing |
| CLI — ENS write commands (register, renew, transfer, edit) | B | Working with private key + Ledger, needs gas estimation polish |
| CLI — Agent commands (register, link, info) | B | ERC-8004 + ENSIP-25 on Base, working end-to-end |
| CLI — Trust resolution (ensemble trust) | D | Not yet built |
| CLI — Manifest commands (create, pin, verify) | D | Not yet built |
| CLI — Launch ceremony (ensemble launch) | D | Not yet built |
| Resolver library (@synthesis/resolver) | D | Not yet built — types defined in PRD.md |
| Site (Next.js) | D | Not yet built — spec in SITE.md |
| Dweb hosting (IPFS + ENS contenthash) | D | Not yet built — spec in SKILL-decentralized-web-stack.md |
| Identity token ($IDENTITY_TOKEN) | D | Not yet deployed — spec in IDENTITY-TOKEN.md |
| Agent wallet (Safe + passkeys) | D | Not yet built — spec in AGENT-WALLET.md |
| Spending layer (Agent card + x402) | D | Research phase — spec in AGENT-CARD.md |

### Grading Scale

- **A** — Production-ready, tested, documented
- **B** — Working, needs polish or edge-case coverage
- **C** — Functional but fragile, known gaps
- **D** — Prototype / spike / spec only, not production-safe

## Known Debt

| Item | Severity | Domain | Plan |
|---|---|---|---|
| No automated tests for CLI commands | Medium | CLI | Add vitest suite after resolver is built |
| ERC-7930 encoding untested on mainnet names | Low | CLI/utils | Verify with live ENSIP-25 records |
| No IPFS utility in resolver package | Medium | Resolver | Build utils/ipfs.ts in Phase 1 |
| Two ERC-8004 registrations (#24994 + #19327) need clarification | Low | Docs | Documented in README.md |
