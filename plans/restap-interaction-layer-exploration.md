# Plan: RESTAP interaction-layer exploration (prep)

Tracks: #63. This is a prep/research brief, not an implementation plan —
#63 is explicitly an open exploration ("is this genuinely useful, or just
aesthetically adjacent"), not a committed feature.

## Framing from the issue

Synthesis is a **trust substrate**: identity binding, ENSIP-25/ERC-8004
linkage, ENSIP-26 discovery, AIP manifest lineage, SKILL/capability
verification, conformance checking. It answers "who is this agent, is it
bound to the claimed identity, has it changed, should I trust it."

RESTAP would sit as a thin **interaction substrate** on top, answering "how
do I talk to it, what does it expose, what's callable, how does another
UI/app interact with it" — explicitly NOT a replacement for any TRL layer,
and explicitly not expected to solve identity binding, output trust,
version integrity, provenance, permissioning, payment, async orchestration,
or abuse resistance. If adopted, it's positioned as a thin layer, gated by
Synthesis underneath.

## Two framings to evaluate, per the issue

1. **Digital persona surface** — makes an agent's `/agent/<name>` page feel
   like a live, addressable interface (discoverable, conversational,
   inspectable capabilities) rather than a static profile + chat box.
2. **Cross-site interaction protocol** — lets Synthesis-style agent sites
   talk to each other (resolve + verify peer via Synthesis, discover a
   RESTAP manifest, call `/talk`, discover/invoke capabilities) without
   custom point-to-point integration per pair of sites.

## Open questions the issue poses (unanswered — first session should form a view)

- Should Synthesis expose a RESTAP-compatible surface on agent pages at
  all, or is this staying exploratory?
- Framing: persona interoperability vs. agent-to-agent interaction vs. just
  a demo/integration layer?
- Minimal useful implementation: discovery only? A `/talk` proxy? Capability
  endpoints?
- How does this sit alongside the existing ENSIP-26 / AIP / SKILL discovery
  layers — complementary, overlapping, or redundant?
- Is RESTAP actually the right protocol, or just a convenient reference
  point?

## Issue's suggested first step

Prototype a very thin RESTAP adapter for the site:

- expose a discovery document for an ENS-bound agent page
- map the existing chat surface (`/agent/<name>`'s ChatPanel →
  `agent-endpoint[chat]`) to `/talk`
- expose a small capability set
- keep Synthesis verification as the gating/context layer underneath —
  RESTAP never becomes the source of trust

## Prep notes for next session

- Read `PLAN.md` / `ARCHITECTURE.md` first per the repo's own entry-point
  convention before touching this — confirm where a RESTAP adapter would
  actually live in the layer model (types → config → repo → service → api
  → ui) and whether it's CLI-first (per this repo's stated rule: every
  feature works as an `ensemble` command before a site route).
- `emilemarcelagustin.eth`'s live `/agent/emilemarcelagustin.eth` page and
  chat surface (see #66, #68) are the most concrete existing "digital
  persona" surface to prototype against — already has a working chat
  endpoint that a `/talk` mapping could sit in front of.
- No code in this repo yet references RESTAP — this is a genuinely fresh
  exploration, confirm scope/appetite with the user before writing an
  actual adapter, since #63 reads as "explore whether this is useful" not
  "build this."
