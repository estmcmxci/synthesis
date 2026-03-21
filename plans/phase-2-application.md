# Phase 2: Application — Personal Site

## Overview

Build the web interface for the TRL at `emilemarcelagustin.eth`. The site serves two audiences simultaneously: humans read the essay and see the trust profile; machines consume JSON-LD, SKILL.md, and agent-context records.

The site *is* the reference implementation — resolve `emilemarcelagustin.eth` and what comes back is a human who has deliberately made themselves fully legible.

Linear epic: SYN-7 · GitHub milestone: Phase 2: Application · Due: Mar 28

## Issues

| Issue | Task | Depends on | Status |
|-------|------|------------|--------|
| ~~SYN-26~~ | Scaffold Next.js site | — | Done (PR #1) |
| **SYN-27** | Build landing page (`/`) — identity + thesis | — | Next |
| **SYN-28** | Publish "The Abstracted Self" (`/essay`) | — | |
| **SYN-29** | Build interactive TRL resolver (`/resolve`) | SYN-24 | |
| **SYN-30** | Build live trust profile page (`/trust`) | SYN-24 | |
| **SYN-31** | Build token profile page (`/token`) | — | |
| **SYN-32** | Add machine-readable layer (JSON-LD, SKILL.md, OG) | — | |

## Stack (already scaffolded)

- **Next.js 15** — App Router, Server Actions
- **React 19** — UI rendering
- **Tailwind 4** — styling
- **MDX** — essay content (`@mdx-js/react` + `@next/mdx`)
- **`@synthesis/resolver`** — workspace dependency for live resolution

## Architecture

```
packages/site/
├── next.config.ts           # MDX plugin configured
├── postcss.config.mjs       # @tailwindcss/postcss
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout (exists)
│   │   ├── page.tsx         # / — landing (SYN-27)
│   │   ├── globals.css      # Tailwind import (exists)
│   │   ├── essay/
│   │   │   └── page.tsx     # /essay — The Abstracted Self (SYN-28)
│   │   ├── resolve/
│   │   │   └── page.tsx     # /resolve — interactive TRL demo (SYN-29)
│   │   ├── trust/
│   │   │   └── page.tsx     # /trust — live trust profile (SYN-30)
│   │   ├── token/
│   │   │   └── page.tsx     # /token — $ESTMCMXCI profile (SYN-31)
│   │   └── skill.md/
│   │       └── route.ts     # /skill.md — machine-readable (SYN-32)
│   ├── components/
│   │   ├── trust-profile.tsx     # TRL result visualization
│   │   ├── layer-badge.tsx       # Per-layer pass/fail indicator
│   │   └── resolver-form.tsx     # ENS name input + resolve trigger
│   └── mdx-components.tsx   # MDX component overrides (exists)
```

### Dual deployment (Phase 3)

- **Vercel** — dynamic routes (`/resolve`, `/trust`, `/token`) with Server Actions for RPC calls
- **IPFS** — static export of content pages (`/`, `/essay`, `/skill.md`) via OmniPin

For now (Phase 2), we build everything on Vercel. Phase 3 handles the IPFS static mirror.

## Implementation Details

### SYN-27: Landing page (`/`)

The front door. Establishes identity and states the thesis.

**Content:**
- Name: Émile Marcel Agustín
- ENS: `emilemarcelagustin.eth`
- The thesis of deliberate legibility — one paragraph
- Links to `/essay`, `/trust`, `/resolve`
- Minimal, intentional design — not a template

**Design direction (from SITE.md):**
> Should feel intentional and authored — not a template.

Dark background, clean typography, centered content. The meta-critique: the site arguing legibility hollows out the self is itself the most legible artifact on the internet.

### SYN-28: Essay (`/essay`)

Convert "The Abstracted Self" PDF into MDX content. The five sketches become navigable sections.

**Source:** `/Users/oakgroup/synthesis/The Abstracted Self.pdf`

The essay is the intellectual foundation. It diagnoses algorithmic legibility as psychic violence. The site is the inversion — conscious, deliberate legibility.

### SYN-29: Interactive TRL resolver (`/resolve`)

The demo page. Type any ENS name, see all 5 layers resolve.

**Implementation:**
- Client-side form → Server Action calls `resolve()` from `@synthesis/resolver`
- Display per-layer results with pass/fail badges
- Default example: `emilemarcelagustin.eth`
- Show raw records for transparency

### SYN-30: Trust profile (`/trust`)

Live trust profile for `emilemarcelagustin.eth` — the reference implementation *is* the demo.

**Implementation:**
- Server Component that calls `resolve("emilemarcelagustin.eth")` at request time
- Displays all 5 layers with current status
- Visual trust tier indicator
- Links to on-chain records (BaseScan, ENS app)

### SYN-31: Token profile (`/token`)

$ESTMCMXCI token profile page. Displays:
- Live price + chart (Uniswap pool data)
- Trust profile of the deployer (TRL-resolved)
- Trading link (Uniswap on Base)
- Fee earnings (claimable WETH + token)

**Note:** Token doesn't exist yet (Phase 4). Build the UI shell with placeholder data, wire up live data after launch.

### SYN-32: Machine-readable layer

Make the site consumable by machines:
- `/skill.md` route handler — serves SKILL.md with `force-static`
- JSON-LD structured data on every page (schema.org Person + custom agent vocab)
- Open Graph + Twitter Card meta tags
- `<link rel="alternate">` pointing to machine formats

## Design Principles

1. **Intentional, not templated** — every element is a deliberate choice
2. **Dual-audience** — humans see prose, machines see structured data
3. **The container is the argument** — the site's architecture embodies the thesis
4. **Dark mode** — fits the tone of the essay
5. **Typography-first** — the essay is the centerpiece

## ENS Name

The site represents `emilemarcelagustin.eth` (not estmcmxci.eth). All references, metadata, and resolution examples use this name.

## Risks

- **Essay conversion quality** — the PDF has 5 sketches with AI-generated illustrations. MDX conversion may lose formatting nuance. Keep it simple — text first.
- **Resolver performance** — `resolve()` makes multiple RPC calls. Server-side caching or ISR may be needed for `/trust`.
- **Token page without a token** — Phase 4 deploys the token. Build the UI shell now, wire live data later.
