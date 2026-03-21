# Phase 0: Personhood — World ID + AgentKit

## Overview

Add proof-of-personhood as Resolution Layer 0 in the TRL. This answers the most fundamental question in agent trust: "Is a real, unique human behind this agent?"

## Issues

| Issue | Task | Depends on |
|-------|------|------------|
| SYN-12 | Implement `layers/personhood.ts` — AgentBook lookup | — |
| SYN-13 | Add `ensemble personhood check <address>` CLI command | SYN-12 |
| SYN-47 | Add `ensemble personhood register` CLI command | — |
| SYN-14 | Register estmcmxci.eth in AgentBook via AgentKit | SYN-47 |
| SYN-5 | Epic — close when all above are done | SYN-12, 13, 14, 47 |

## Implementation Order

### SYN-12: `layers/personhood.ts` (resolver, read-only)

**What**: Add personhood resolution to `@synthesis/resolver`.

**AgentKit API** (from research):
```typescript
import { createAgentBookVerifier } from '@worldcoin/agentkit';

const verifier = createAgentBookVerifier({ network: 'base' });
const humanId = await verifier.lookupHuman(address, 'eip155:8453');
// Returns hex string (nullifier hash) or null
```

**Contract fallback** (if AgentKit is flaky):
```typescript
import { createPublicClient, http, toHex } from 'viem';
import { base } from 'viem/chains';

const AGENT_BOOK_ABI = [{
  inputs: [{ internalType: 'address', name: '', type: 'address' }],
  name: 'lookupHuman',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
}] as const;

const client = createPublicClient({ chain: base, transport: http() });
const humanId = await client.readContract({
  address: '0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4',
  abi: AGENT_BOOK_ABI,
  functionName: 'lookupHuman',
  args: [address],
});
// Returns 0n (not registered) or non-zero bigint (nullifier hash)
```

**Files to create/modify**:
- `packages/resolver/src/layers/personhood.ts` — the resolver layer
- `packages/resolver/src/schema.ts` — add `PersonhoodResult` to schema
- `packages/resolver/src/index.ts` — re-export

**PersonhoodResult schema**:
```typescript
const PersonhoodResultSchema = z.object({
  verified: z.boolean(),
  nullifierHash: z.string().nullable(),
  network: z.enum(['base', 'world']).nullable(),
  agentBookAddress: z.string().nullable(),
});
```

**Approach**: Try AgentKit first. If it errors or is too slow, fall back to direct viem `readContract()`. Both query the same on-chain state.

**Key rule from BELIEFS.md**: Resolution layers are read-only. No writes.

### SYN-13: `ensemble personhood check <address>` (CLI)

**What**: CLI command that wraps the resolver layer.

```bash
ensemble personhood check 0x579bc9f36e339bbc8f2580a792e4db4bcf39105
# → Personhood: ✓ (World ID verified, nullifier: 0x3a...)
# → Network: Base (0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4)

ensemble personhood check 0x0000000000000000000000000000000000000000
# → Personhood: ✗ (not registered in AgentBook)
```

**Files**:
- `packages/cli/commands/personhood.ts` — CLI command (uses incur)
- `packages/cli/commands/index.ts` — register command

**Key rule from BELIEFS.md**: CLI-first. Validate input with Zod (address format). Business logic in the resolver layer, not the command handler.

### SYN-47: `ensemble personhood register` (CLI)

**What**: Interactive CLI command that registers an agent address in AgentBook.

**Approach**: Shell out to `@worldcoin/agentkit-cli`:
```bash
npx @worldcoin/agentkit-cli register <address> --network base
```

This handles the full World ID QR code flow (displays QR → user scans with World App → ZK proof generated → submitted to relay → on-chain registration).

**Files**:
- Same `packages/cli/commands/personhood.ts` — add `register` subcommand
- Need to install `@worldcoin/agentkit-cli` as a devDep in CLI package

**Alternative**: If we want tighter integration, we can use `@worldcoin/idkit-core` directly to manage the bridge/QR flow. But shelling out to the CLI is simpler and the registration is a one-time human task.

### SYN-14: Register estmcmxci.eth in AgentBook

**What**: Actually run the registration for our agent wallet.

**Address to register**: `0x703ae03fB120eC91e9Ed6d08Ce8044E498CC789B` (estmcmxci.eth owner)

**This is a human task** — requires biometric World ID verification via the Orb or World App. Can be done after SYN-47 is built by running:
```bash
ensemble personhood register --address 0x703ae03fB120eC91e9Ed6d08Ce8044E498CC789B --network base
```

## PRD Update Required

The `TrustProfile` interface in PRD.md needs a `personhood` field:
```typescript
// Resolution Layer 0: Personhood (World ID)
personhood: {
  verified: boolean;
  nullifierHash: string | null;
  network: string | null;        // 'base' | 'world'
};
```

And the trust tier computation needs updating — `personhood` is the floor but not required for other tiers (an agent without World ID can still be `registered` through `full`, but personhood adds a stronger signal).

## AgentBook Contracts

| Network | Chain ID | Address |
|---------|----------|---------|
| Base mainnet | eip155:8453 | `0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4` |
| World Chain | eip155:480 | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` |
| Base Sepolia | eip155:84532 | `0xA23aB2712eA7BBa896930544C7d6636a96b944dA` |

## Risk

- **AgentKit v0.1.5 instability**: Fallback to direct viem contract read (same ABI, same result).
- **World App requirement**: Registration requires the World App. If the user doesn't have it, SYN-14 blocks. The resolver layer (SYN-12) and check command (SYN-13) work regardless.
- **Gas on Base**: Registration via relay is gasless (Worldcoin sponsors). If relay is down, manual mode requires Base ETH.
