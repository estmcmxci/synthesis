# Synthesis — Trust Resolution Layer

A primitive for verifiable agent identity, capability discovery, and version integrity — anchored to ENS.

## Entry Point

Read `PLAN.md` first — it is the build plan and product vision.
Read `ARCHITECTURE.md` for how all layers compose.

## Rules

- CLI-first: every feature must work as an `ensemble` CLI command before getting a site route or UI
- Zod validation on all API routes and CLI inputs
- No `any` in core domain logic
- ENS names are the root of trust — everything derives from on-chain records
- Bankr for crypto execution (token deploy, swaps, transfers, fee claims)
- Resolution layers are read-only — the TRL resolver never writes
- Follow the layer model: types → config → repo → service → api → ui
- Do NOT run `pnpm dev` unless verifying specific changes

## Working on Issues

When working on a GitHub or Linear issue:
1. Read `PLAN.md` for build plan and product vision
2. Read the relevant spec (PRD.md, SITE.md, IDENTITY-TOKEN.md, etc.)
3. Create a plan in `plans/` for features before coding
4. When done: open a PR, describe what changed and why, link the issue

## Commits

Use conventional commits: `feat(scope): ...`, `fix(scope): ...`, etc.
Scopes: `cli`, `resolver`, `site`, `docs`, `infra`
Include summary, rationale, and test status in the body.
Append: `Co-authored-by: Claude <noreply@anthropic.com>`

## Key Docs

- Build plan + product vision → `PLAN.md`
- Architecture + layer model → `ARCHITECTURE.md`
- Invariants + golden rules → `BELIEFS.md`
- Quality + known debt → `QUALITY.md`
- TRL product requirements → `PRD.md`
- Domain specs → `spec/`
- Execution plans → `plans/`
