# Phase 3: Hosting — Dweb Deployment + ENS Records

## Overview

Deploy the site to Vercel + IPFS simultaneously, set all ENS records on `emilemarcelagustin.eth`, and verify the full trust stack resolves end-to-end.

This is where the trust profile lights up — Layers 1-4 go from ✗ to ✓.

Linear epic: SYN-8 · GitHub milestone: Phase 3: Hosting · Due: Mar 29

## Issues

| Issue | Task | Depends on | Status |
|-------|------|------------|--------|
| **SYN-33** | Set up IPFS pinning (OmniPin + Pinata) | — | |
| **SYN-34** | Build `ensemble deploy` CLI command | SYN-33 | |
| **SYN-35** | Set ENS records on emilemarcelagustin.eth | Deploy done | |
| **SYN-36** | Create + sign + pin AIP v1 manifest | SYN-33, SYN-35 | |
| **SYN-37** | Verify at emilemarcelagustin.eth.limo + `ensemble trust` | All above | |

## Priority Order

1. **Deploy to Vercel** — get the site live so `agent-context` has a real URL
2. **Deploy to IPFS** — static export + OmniPin for the dweb mirror
3. **Set ENS records** — ENSIP-25, ENSIP-26, AIP
4. **Create + pin manifest** — AIP v1 with minimal payload
5. **Verify** — all layers passing, site reachable via ENS gateway

## Implementation Details

### Deploy to Vercel

Connect the repo to Vercel. Configure:
- Root directory: `packages/site`
- Build command: `pnpm build`
- Output: `.next`
- Framework: Next.js

The site will be accessible at a Vercel URL (e.g., `synthesis-trl.vercel.app`) and later via ENS gateway.

### SYN-33: IPFS pinning setup

Use OmniPin (already installed as root devDep) for the static export:
```bash
npx omnipin deploy ./packages/site/out --provider pinata
```

Requires:
- `next.config.ts` updated with `output: 'export'` for static pages
- PINATA_JWT in `.env`
- Note: `/trust` and `/resolve` use Server Actions — they won't work in static export. The IPFS mirror serves `/`, `/essay`, `/token`, `/skill.md` only.

### SYN-34: `ensemble deploy` CLI command

Wraps OmniPin:
```bash
ensemble deploy --site packages/site --ens emilemarcelagustin.eth
```

Steps:
1. Build static export
2. Pin to IPFS via OmniPin
3. (Optional) Set ENS contenthash to the IPFS CID

### SYN-35: Set ENS records

All records set on `emilemarcelagustin.eth` using `0xeb0ABB...022` (manager key in `.env`).

**ENSIP-25 — Layer 1 (Identity):**

Two records — both registries:

```bash
# AgentBook on Base (you control the address)
ensemble edit txt emilemarcelagustin.eth \
  "agent-registration[0x0001000002210514e1d1d3526a6faa37eb36bd10b933c1b77f4561a4][0xeb0ABB367540f90B57b3d5719fd2b9c740a15022]" \
  "1" --network mainnet

# ERC-8004 on Base (hackathon token #24994)
ensemble edit txt emilemarcelagustin.eth \
  "agent-registration[0x00010000022105148004a169fb4a3325136eb29fa0ceb6d2e539a432][24994]" \
  "1" --network mainnet
```

**ENSIP-26 — Layer 2 (Context):**

```bash
ensemble context set emilemarcelagustin.eth \
  '{"skill":"https://emilemarcelagustin.eth.limo/skill.md","site":"https://synthesis-trl.vercel.app","endpoints":["https://synthesis-trl.vercel.app/resolve"]}' \
  --network mainnet
```

**AIP — Layer 3 (Manifest):**

```bash
# Set lineage mode + latest version on root name
ensemble edit txt emilemarcelagustin.eth agent-latest v1 --network mainnet
ensemble edit txt emilemarcelagustin.eth agent-version-lineage subname --network mainnet

# Create v1 subname and set manifest CID (after SYN-36)
ensemble edit txt v1.emilemarcelagustin.eth agent-manifest ipfs://<CID> --network mainnet
```

### SYN-36: Create + pin AIP v1 manifest

```bash
# Create and sign
ensemble manifest create emilemarcelagustin.eth --ver v1 \
  --payload '{"endpoints":["https://emilemarcelagustin.eth.limo"],"capabilities":["trust-resolution","ens-identity"]}' \
  -o manifest-v1.json

# Pin to IPFS
ensemble manifest pin manifest-v1.json
# → Returns CID, use in SYN-35 for agent-manifest record
```

Minimal payload for v1. Note: iterate on v2 later with policy, social links, and richer capabilities.

### SYN-37: Verify

```bash
# CLI verification
ensemble trust emilemarcelagustin.eth

# Should show:
# ✓ Personhood: World ID verified
# ✓ Identity: ENSIP-25 (AgentBook + ERC-8004)
# ✓ Context: ENSIP-26 (agent-context with skill URL)
# ✓ Manifest: AIP v1, signature valid
# ✓ Skill: domain-verified at emilemarcelagustin.eth.limo
# Trust Tier: full
```

Also verify:
- `https://emilemarcelagustin.eth.limo` loads the site
- `/trust` page shows all layers green
- `/resolve` works for other ENS names too

## Resolver Updates Needed

Before setting records, the resolver needs updates to work with the new ERC-7930 format and AgentBook ENSIP-25 records:

1. **Identity layer** — needs to scan AgentBook registry in addition to ERC-8004. Currently only checks ERC-8004 registries.
2. **Agent ID format** — AgentBook uses addresses as agent IDs, not numeric IDs. The resolver's `knownAgentIds` pattern needs to support this.
3. **Remove agent ID requirement from `/resolve`** — already done in PR #24 (pending merge).

## ENS Name

All records on `emilemarcelagustin.eth`. Signing address: `0xeb0ABB367540f90B57b3d5719fd2b9c740a15022`.

**DO NOT** use `estmcmxci.eth` or `0x703a...89B` for any operations.

## Gas Costs

Setting text records on mainnet costs gas. Estimate ~5-7 transactions:
- 2x ENSIP-25 records
- 1x agent-context
- 1x agent-latest
- 1x agent-version-lineage
- 1x agent-manifest on v1 subname (requires subname creation first)

Ensure `0xeb0ABB...022` has enough mainnet ETH for gas.

## Risks

- **Subname creation** — `v1.emilemarcelagustin.eth` requires the name owner (or manager) to create subnames. May need NameWrapper or a resolver that supports subnames.
- **Gas costs** — multiple mainnet transactions. Batch if possible.
- **Static export limitations** — `/trust` and `/resolve` use Server Actions and won't work from IPFS. Only static pages are mirrored.
- **Vercel URL not final** — `agent-context` URL will need updating if the Vercel deployment URL changes.
