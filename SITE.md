# estmcmxci.eth — A Personal Website as Reference Implementation

## Concentrate

You are the reference implementation.

  The TRL was designed to resolve agent identity through ENS. You (estmcmxci.eth) already have the on-chain registration, the records, the
  infrastructure. The personal website doesn't just use the TRL — it is the TRL demo. Resolve estmcmxci.eth and what comes back is a human who has
  deliberately made themselves a fully-indexed, cryptographically-verifiable entity.

  The essay is the diagnosis. The site is the treatment — or the willing submission to the disease, eyes open.

  So the architecture:

  - estmcmxci.eth as the root identity, resolvable through all 4 TRL layers
  - The site hosts the essay (the critique), the trust profile (the inversion), your work, your writing — all structured for both human readers and
   machine consumers
  - SKILL.md / agent-context records point to the site — making you discoverable the same way an agent would be
  - The TRL resolver lives on the site as an interactive demo: type any ENS name, see the trust stack. But the default example is you.

  The meta-critique writes itself: the site that argues legibility hollows out the self is itself the most legible artifact on the internet.

## The Thesis

"The Abstracted Self" argues that algorithmic legibility forces a divorce from grounded presence — that the self, under recursive mediation, dissolves into performativity until only the platform's resonant frequency remains. The essay concludes with opting out: "legibility was never the same thing as presence."

This project is the inversion.

Not a retreat from legibility, but a *deliberate submission to it*. The personal website becomes a self-index — structured for machines as much as humans. The difference between this and what the essay critiques is intention: the self isn't abstracted if you're the one doing the abstracting.

## You Are the Reference Implementation

The Trust Resolution Layer (TRL) was designed to resolve agent identity through ENS. estmcmxci.eth already has the on-chain infrastructure:

- **ERC-8004 registration** — Agent ID #24994 on Base mainnet (Synthesis hackathon; earlier Bankr registration was #19327)
- **ENS records** — ENSIP-25 (identity), ENSIP-26 (context), AIP (manifest)
- **Bankr agent wallet** — linked via subname (alpha-go.bankrtest.eth)
- **ENSIP-25 status** — fully verified (ENS name <> ERC-8004 identity linked)

The personal website doesn't just *use* the TRL — it *is* the TRL demo. Resolve estmcmxci.eth and what comes back is a human who has deliberately made themselves a fully-indexed, cryptographically-verifiable entity.

The essay is the diagnosis. The site is the willing submission to the disease, eyes open.

## Architecture

```
estmcmxci.eth (root identity)
     |
     +--- ENSIP-25: on-chain identity (ERC-8004 #19327, Base)
     +--- ENSIP-26: agent-context -> points to the site
     +--- AIP: signed manifest, version lineage
     +--- SKILL.md: hosted at skills.estmcmxci.eth
     |
     v
Personal Website (Next.js on Vercel)
     |
     +--- /            Landing — who you are, the thesis
     +--- /essay        "The Abstracted Self" as published content
     +--- /resolve      Interactive TRL demo (resolve any ENS name)
     +--- /trust        Your own trust profile, live-resolved
     +--- /skill.md     Machine-readable capability file at root
     +--- JSON-LD       Structured data throughout (schema.org + custom)
```

## The Meta-Critique

The site that hosts an essay arguing legibility hollows out the self is itself the most legible artifact on the internet. The content is the critique; the container is the inversion. Both are true simultaneously.

This is not a contradiction — it's a synthesis. The essay describes *unconscious* legibility (people performing for the algorithm without knowing it). The site embodies *conscious* legibility (deliberately architecting your own indexability). The difference is the difference between being played and playing the game.

## Stack

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Deployment**: Vercel
- **Identity**: ENS (estmcmxci.eth) as root, TRL resolver as core infrastructure
- **Machine layer**: JSON-LD, Open Graph, SKILL.md, agent-context records

## Next Steps

### 1. Scaffold the Next.js project
Initialize the app inside this repo with App Router, TypeScript, and Tailwind. Set up the route structure: `/`, `/essay`, `/resolve`, `/trust`.

### 2. Design the landing page
The front door. Establishes identity (estmcmxci.eth / Emile Marcel Agustin), states the thesis, and links to the essay and the trust profile. Should feel intentional and authored — not a template.

### 3. Publish "The Abstracted Self" as site content
Convert the PDF essay into structured content (MDX or raw components). The five sketches become navigable sections. The baroque AI-generated illustrations can be preserved or reworked.

### 4. Build the TRL resolver
Port the resolver library (`packages/resolver/` from the existing PLAN.md) into the site. The `/resolve` page takes any ENS name and runs it through all 4 trust layers, displaying results in real time.

### 5. Build the self-trust page
`/trust` — your own trust profile, live-resolved against mainnet. Shows each layer (identity, context, manifest, skill) with pass/fail status. This is the proof that you've made yourself fully legible.

### 6. Add the machine-readable layer
- SKILL.md served at `/skill.md` (or `skills.estmcmxci.eth`)
- JSON-LD structured data on every page
- Open Graph / Twitter cards for social legibility
- `agent-context` ENS record pointing to the site

### 7. Set live ENS records
Update estmcmxci.eth text records to point to the deployed site:
- `agent-context` -> site URL + structured context
- `agent-latest` -> v1 manifest
- SKILL.md URL in context record

### 8. Deploy and verify
Ship to Vercel. Resolve estmcmxci.eth from anywhere and confirm the full trust stack resolves end-to-end, landing on the site that explains what it all means.
