# Workflow — Synthesis

How issues flow from Linear to code to PR.

## Issue Tracking

- **Linear project:** [Trust Resolution Layer](https://linear.app/synthesis-md/project/trust-resolution-layer-a1a77f74feaf)
- **GitHub repo:** [estmcmxci/synthesis](https://github.com/estmcmxci/synthesis) (private, public before deadline)
- **Hackathon project UUID:** `d874021bd42c4d8f94913043a0fa40ed`

## Flow

```
Linear issue (SYN-XX)
       │
       v
Create branch: git checkout -b syn-xx-short-description
       │
       v
Implement (follow BELIEFS.md rules)
       │
       v
/commit → conventional commit linking SYN-XX
       │
       v
/push → push + create PR (label with phase-N)
       │
       v
/land → squash-merge when green
       │
       v
Close Linear issue (auto or manual)
```

## Conventions

- **Branch naming:** `syn-xx-short-description` (Linear auto-generates these)
- **Commit scopes:** `cli`, `resolver`, `site`, `docs`, `infra`
- **PR labels:** `phase-0` through `phase-6` matching Linear epics
- **PR body:** Link the Linear issue URL
- **Milestones:** GitHub milestones match phases 1-4 (hackathon scope)

## Phases → Linear Epics → GitHub Milestones

| Phase | Linear Epic | GitHub Milestone | Due |
|-------|-------------|-----------------|-----|
| 0 — Personhood | SYN-5 | — | — |
| 1 — Substrate | SYN-6 | Phase 1: Substrate | Mar 25 |
| 2 — Application | SYN-7 | Phase 2: Application | Mar 28 |
| 3 — Hosting | SYN-8 | Phase 3: Hosting | Mar 29 |
| 4 — Launch Ceremony | SYN-9 | Phase 4: Launch Ceremony | Mar 31 |
| 5 — Wallet | SYN-10 | — (post-hackathon) | — |
| 6 — Spending | SYN-11 | — (post-hackathon) | — |
