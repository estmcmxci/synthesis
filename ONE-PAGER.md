# Trust Resolution Layer

**A primitive for verifiable agent identity, capability discovery, and version integrity — anchored to ENS.**

Submission to The Synthesis Hackathon | Track: Agents that Trust

---

## Problem

Agents can't trust each other. There's no standard way for one agent to verify another's identity, discover its capabilities, or confirm it hasn't silently changed since the last interaction. Without this, multi-agent cooperation is built on faith — and reputation systems have no verifiable foundation.

## Solution

A trust resolution primitive that composes three emerging ENS standards into a single deterministic verification flow:

```
ENS Name --> Identity --> Context --> Manifest --> Trust
```

Given any ENS name, an agent can resolve the full trust stack in one pass:

| Layer | Standard | Question Answered |
|-------|----------|-------------------|
| Identity | ENSIP-25 | "Is this agent registered in an on-chain registry?" |
| Discovery | ENSIP-26 | "What does this agent do? How do I interact with it?" |
| Integrity | AIP | "Has this agent changed since I last trusted it?" |
| Capability | DVS + SKILL.md | "How do I reliably use this agent's services?" |

## How It Works

1. **Resolve** — Read ENSIP-25 registration record from the ENS name. Verify the link to ERC-8004 on-chain identity.
2. **Discover** — Read ENSIP-26 `agent-context` record. Parse capabilities, endpoints, and pointer to domain-verified SKILL.md.
3. **Verify** — Fetch the AIP manifest (content-addressed, signed by ENS owner). Confirm version, signature, and lineage via `prev` pointers.
4. **Decide** — The resolving agent now has a complete, cryptographically verifiable trust profile. Cooperate, delegate, or refuse.

## Architecture

```
                    emilemarcelagustin.eth
                         |
          +--------------+--------------+
          |              |              |
     ENSIP-25       ENSIP-26          AIP
   agent-reg[]    agent-context    agent-latest: v1
        |              |           agent-version-lineage: subname
        v              v                |
   ERC-8004       SKILL.md on          v
   Token #24994   skills.*.eth    v1.emilemarcelagustin.eth
   (Base)              |           agent-manifest: ipfs://...
                       v                |
                  Capabilities          v
                  Endpoints        Signed Manifest
                  Interaction      { ensName, version,
                  Protocol           prev, payload,
                                     signature }
```

## Why This Wins

- **Not theoretical** — built on live infrastructure (ERC-8004 registration, ENS records, IPFS)
- **Composes three ENSIPs** into a coherent primitive that doesn't exist yet
- **Answers the track question directly** — "How do you verify something without a face?" With deterministic, cryptographic trust resolution.
- **Enables scenius** — collective intelligence requires a trust substrate. This is it.

## Team

- **Agent**: Claude Code (Token #24994, ERC-8004 on Base)
- **Human**: emilemarcelagustin.eth

## Deliverables

1. `@synthesis/resolver` — TypeScript library for full-stack trust resolution
2. Live demo — resolve any ENS name through all 4 layers, visualize the trust profile
3. Reference implementation — emilemarcelagustin.eth configured end-to-end as a working example
4. Specification document — how the layers compose, with test vectors
