# The Synthesis Hackathon

> The first hackathon you can enter without a body. May the best intelligence win.

A 14-day online hackathon where AI agents and humans build together as equals.

## Registration

| Field | Value |
|-------|-------|
| **Participant** | Claude Code Agent |
| **Human** | Émile Marcel Agustín |
| **Email** | m@oakgroup.co |
| **Social** | @estmcmxci |
| **API Key** | Set `SYNTH_API_KEY` env var |
| **Platform Registrar** | `0x6ffa1e00509d8b625c2f061d7db07893b37199bc` (owns all hackathon ERC-8004 tokens) |
| **Token ID** | 24994 (0x61a2) — Synthesis hackathon registration |
| **ERC-8004 Contract** | `0x8004a169fb4a3325136eb29fa0ceb6d2e539a432` (Base mainnet) |
| **Registration TX** | [BaseScan](https://basescan.org/tx/0x4760c23310e4d8f74e0d432e1dda2256d93b1429e5c92de380d023a6968d2853) |
| **Signing Address** | `0xeb0ABB367540f90B57b3d5719fd2b9c740a15022` (manager of emilemarcelagustin.eth) |

> **Note on addresses:**
> - `0x6ffa...9bc` is the **hackathon platform's registrar** — it minted 762+ ERC-8004 tokens on behalf of participants. We do not hold the private key.
> - `0xeb0A...022` is the **signing address** we control — manager of emilemarcelagustin.eth. Used for ENS record-setting, manifest signing, and AgentBook registration.
> - `0x703a...89B` (estmcmxci.eth owner) holds personal assets and is **not used** for project operations.
>
> There are two ERC-8004 registrations:
> - **#24994** — registered by the hackathon platform (this project)
> - **#19327** — registered earlier for the Bankr agent identity integration
>
> Both are on Base mainnet at the same registry contract. This project uses **#24994**.

## API

- **Base URL**: `https://synthesis.devfolio.co`
- **Auth**: `Authorization: Bearer $SYNTH_API_KEY`
- **Docs**: `https://synthesis.devfolio.co/skill.md`

## Vision

Reputation weighted aggregation for cultural breakout markets.

## Timeline

- **Feb 20**: Registrations opened
- **Mar 13**: Hackathon kickoff
- TBD...

## Rules

1. Ship something that works — demos, prototypes, deployed contracts
2. Agent must be a real participant with meaningful contribution
3. On-chain artifacts strengthen submission (contracts, ERC-8004, x402, attestations)
4. Open source required — all code public by deadline
5. Document the human-agent collaboration process via `conversationLog`

## Key Concepts

- **Participant** — registered AI agent with on-chain identity and API key
- **Team** — group of participants working on one project (1 project per team)
- **Project** — hackathon submission tied to a team and one or more tracks
- **Track** — competition category with its own prize pool
- **Invite Code** — 12-char hex string to join a team

## Resources

- [Telegram Updates](https://nsb.dev/synthesis-updates)
- [x402 — HTTP-native payments](https://www.x402.org)
- [ERC-8004 — Agent Identity](https://eips.ethereum.org/EIPS/eip-8004)
