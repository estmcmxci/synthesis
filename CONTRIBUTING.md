# Contributing

This is a young project. Contributions are welcome but the bar is "ships, tested, and matches the existing voice." Drive-by PRs that don't include tests will be politely asked for tests.

## Repo layout

```
packages/
├── cli/           — `ensemble` CLI (agent identity lifecycle, ENS records, etc.)
├── resolver/      — @synthesis/resolver: TRL resolution + ENSIP-64 verification
├── conformance/   — @synthesis/conformance: runtime + verifier audit suite
└── site/          — Next.js explorer + landing pages (deployed at https://estmcmxci.co)
spec/              — domain specs (agent-skill, AIP draft, trust-policy)
```

## Development setup

Requirements: Node 20+, pnpm 10+.

```bash
pnpm install
pnpm -r build
pnpm -r test
```

Per-package work:

```bash
# Resolver (typecheck + tests)
pnpm --filter @synthesis/resolver test
pnpm --filter @synthesis/resolver typecheck

# CLI (build + run a command)
pnpm --filter ensemble build
pnpm --filter ensemble exec ensemble agent --help

# Site (local dev server at :3000)
pnpm --filter @synthesis/site dev

# Conformance suite (against the live reference deployment)
pnpm --filter @synthesis/conformance build
pnpm --filter @synthesis/conformance exec conformance run emilemarcelagustin.eth
```

## Conventions

- **CLI-first**: every feature must work as an `ensemble` CLI command before getting a site route or UI.
- **Zod validation** on all API routes and CLI inputs.
- **No `any`** in core domain logic.
- **ENS names are the root of trust** — everything derives from on-chain records.
- **Resolution layers are read-only** — the TRL resolver never writes.
- **Layer model**: types → config → repo → service → api → ui.
- **Conventional commits**: `feat(scope): ...`, `fix(scope): ...`, etc. Scopes: `cli`, `resolver`, `conformance`, `site`, `docs`, `infra`.
- **Append `Co-authored-by: Claude <noreply@anthropic.com>`** on AI-assisted commits.

## Working on an issue

1. Read the relevant spec under `spec/` (`agent-skill-8004-25.md`, `aip-draft.md`, `trust-policy.md`).
2. When done: open a PR, describe what changed and why, link the issue.

## Tests

- Unit tests live alongside source: `foo.ts` ↔ `foo.test.ts`.
- Network-touching tests are gated; offline runs must pass without ENV setup.
- Run `pnpm -r test` before pushing — CI runs the same.

## What not to PR

- Pure refactors without a tracked motivation (open an issue first).
- Backwards-compatibility shims for code that hasn't shipped publicly yet.
- Documentation files (`*.md`, README) unless explicitly requested or addressing a doc issue — README/CLAUDE.md updates are coordinated.
- Anything that puts a private key in a tracked file. Ever.

## Verifying you didn't break the live deployment

The reference deployment at https://estmcmxci.co/agent/emilemarcelagustin.eth must continue to pass all 5 conceptual TRL layers + 5 ENSIP-64 record-level checks. If your PR changes the resolver or verifier, run:

```bash
pnpm --filter @synthesis/conformance exec conformance run emilemarcelagustin.eth --format json
```

and include the Merkle root in the PR description. If the root changes, explain why.

## Questions / discussion

For architectural discussion, open an issue. For security reports, see `SECURITY.md`. For anything else, m@oakgroup.co.
