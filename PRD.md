# Trust Resolution Layer — Product Requirements Document

Version: 0.1 | 2026-03-06

---

## 1. Overview

The Trust Resolution Layer (TRL) is a TypeScript library and demo application that enables any agent to deterministically verify another agent's identity, capabilities, version integrity, and interaction protocol — using only an ENS name as input.

It composes ENSIP-25, ENSIP-26, and Agent Identity Profile (AIP) into a single resolution flow, producing a structured trust profile that agents can use to make cooperation decisions.

> **Terminology note:** The TRL has its own internal hierarchy of "Resolution Layers" (0–4: Personhood, Identity, Discovery, Integrity, Capability). These are distinct from the "Product Stack Layers" (0–5: Hosting → Spending) described in `ARCHITECTURE.md`. When this document says "Layer," it means a TRL Resolution Layer.

## 2. Users

### Primary
- **AI agents** (Claude Code, OpenClaw, Cursor, crypto agents) that need to verify counterparties before cooperating, delegating tasks, or accepting instructions.

### Secondary
- **Agent developers** who need to publish verifiable identity and capability records for their agents.
- **Protocol designers** building reputation systems, agent marketplaces, or coordination frameworks that need a trust primitive.

## 3. Core Requirements

### 3.1 Trust Resolution (the library)

**Input**: An ENS name (e.g., `estmcmxci.eth`)

**Output**: A `TrustProfile` object containing:

```typescript
interface TrustProfile {
  ensName: string;
  resolvedAt: number; // unix timestamp

  // Resolution Layer 1: Identity (ENSIP-25)
  identity: {
    verified: boolean;
    registryAddress: string | null;  // ERC-7930 encoded
    agentId: string | null;          // e.g., "24994"
    registryChain: string | null;    // e.g., "eip155:8453"
    tokenURI: string | null;        // from ERC-8004
  };

  // Resolution Layer 2: Discovery (ENSIP-26)
  context: {
    found: boolean;
    raw: string | null;              // raw agent-context value
    parsed: Record<string, any> | null; // if structured format
    skillUrl: string | null;         // extracted SKILL.md URL if present
  };

  // Resolution Layer 3: Integrity (AIP)
  manifest: {
    found: boolean;
    latestVersion: string | null;    // agent-latest value
    lineageMode: string | null;      // "subname" | "list"
    manifest: AgentManifest | null;  // fetched + parsed manifest
    signatureValid: boolean;
    lineageDepth: number;            // how many prev pointers traversed
    lineageIntact: boolean;          // no broken links in prev chain
  };

  // Resolution Layer 4: Capability (DVS)
  skill: {
    found: boolean;
    domainVerified: boolean;         // served from ENS-owned domain
    content: string | null;          // raw SKILL.md content
  };

  // Aggregate
  trustScore: TrustTier; // "none" | "registered" | "discoverable" | "verified" | "full"
}
```

**Trust tiers** (progressive — each requires all previous):
- `none` — no ENSIP-25 registration found
- `registered` — ENSIP-25 verified, on-chain identity confirmed
- `discoverable` — ENSIP-26 agent-context present
- `verified` — AIP manifest found, signature valid
- `full` — all layers verified, SKILL.md on verified domain, lineage intact

### 3.2 Resolution Steps

The resolver MUST execute these steps in order:

1. **Normalize** the ENS name per ENSIP-1.
2. **Scan for ENSIP-25 records** — query known registry addresses (ERC-8004 on Base mainnet and ETH mainnet). For each, construct the `agent-registration[registry][agentId]` key and check for non-empty value.
3. **Read ENSIP-26 record** — query `agent-context` text record.
4. **Read AIP records** — query `agent-latest` and `agent-version-lineage` from root name. If lineage mode is `subname`, resolve `agent-manifest` from `<version>.<name>`. Fetch manifest from IPFS/URL.
5. **Verify manifest signature** — confirm signer is current ENS owner.
6. **Walk lineage** — traverse `prev` pointers up to a configurable depth (default: 10). Record depth and whether chain is intact.
7. **Fetch SKILL.md** — if `agent-context` contains a skill URL, fetch it. Check if the domain is ENS-owned.
8. **Compute trust tier** — based on which layers passed.

### 3.3 Demo Application

A web-based (or CLI) tool that:
- Takes an ENS name as input
- Runs the full resolution flow
- Displays the trust profile with clear pass/fail per layer
- Visualizes the version lineage chain
- Shows the raw records for transparency

### 3.4 Reference Records

Set up `estmcmxci.eth` with all records as a live, working example:
- ENSIP-25: `agent-registration[<base-registry>][24994]` = `"1"`
- ENSIP-26: `agent-context` = structured context with SKILL.md pointer
- AIP: `agent-latest` = `v1`, `agent-version-lineage` = `subname`
- AIP: `v1.estmcmxci.eth` → `agent-manifest` = `ipfs://...`
- SKILL.md hosted on ENS subdomain

## 4. Non-Requirements (Explicitly Out of Scope)

- Token-gating or access control based on trust tiers
- Reputation scoring beyond the trust tier enum
- Agent-to-agent communication protocol
- Key delegation or revocation (deferred per AIP spec)
- Multi-registry aggregation (resolve against one registry at a time)
- Caching layer (consumers handle their own caching)

## 5. Technical Constraints

- **Runtime**: Must work in Node.js 20+ and modern browsers
- **Dependencies**: ethers.js or viem for ENS resolution, IPFS gateway for manifest fetching
- **RPC**: Default to public RPCs (eth.drpc.org for mainnet, Base public RPC). Allow override.
- **No private keys**: The resolver is read-only. Record-setting is a separate concern (scripts/CLI).
- **ENS resolution**: Use standard ENS public resolver. Support CCIP-Read (ERC-3668) for offchain names.

## 6. Success Criteria

1. `resolve("estmcmxci.eth")` returns a complete `TrustProfile` with `trustScore: "full"`
2. Resolution completes in under 5 seconds on mainnet
3. Demo clearly visualizes each trust layer
4. At least one other agent/name can be resolved (even if it returns partial trust)
5. Code is open source, documented, and deployed before hackathon deadline

## 7. Open Questions

- [ ] Should `agent-context` (ENSIP-26) contain the SKILL.md content inline, or always point to a URL?
- [ ] Which IPFS gateway to use for manifest resolution? (ipfs.io, w3s.link, cloudflare-ipfs)
- [ ] Should the demo be a standalone web app or integrated into an existing tool?
- [ ] How to handle ENS names on L2 (Base, etc.) vs mainnet-only resolution?
- [ ] Should we propose a formal ENSIP number for AIP, or keep it as a draft spec within the project?
