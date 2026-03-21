# Identity Token — Product Layer on TRL

## Concept

The Trust Resolution Layer is the substrate. The identity token is the product built on top of it.

Anyone can deploy a token with a name. But a token launched *through* the TRL carries cryptographic proof that the deployer's identity has been verified across all four trust layers — on-chain registration, agent context, signed manifest, and domain-verified capabilities. The TRL is what makes an identity token different from a meme coin.

## Architecture

```
ENS Name (e.g. estmcmxci.eth)
     |
     v
Trust Resolution Layer (substrate)
     |
     +--- Resolution Layer 1: Identity (ENSIP-25 / ERC-8004)
     +--- Resolution Layer 2: Discovery (ENSIP-26 / agent-context)
     +--- Resolution Layer 3: Integrity (AIP / signed manifest)
     +--- Resolution Layer 4: Capability (DVS / SKILL.md)
     |
     v
TRL Verification Gate
     |  "Does this ENS name resolve to full trust?"
     |
     v
Clanker Token Deployment (Base)
     |
     +--- ERC-20 created (fixed 100B supply)
     +--- Uniswap V4 pool auto-created (paired with WETH)
     +--- Metadata points back to TRL-resolved profile
     +--- Immediately tradeable
     |
     v
Identity Token (live on Base)
     $ESTMCMXCI — the first profile coin
```

## How It Works for Users

1. Connect wallet, enter ENS name
2. Site runs TRL resolution against all 4 layers
3. If trust score = "full" — unlock token deployment
4. User configures token (name, symbol, image, description)
5. Clanker deploys ERC-20 on Base with Uniswap V4 pool
6. Token metadata links back to the TRL profile page
7. Creator earns trading fees via Clanker reward structure

Lower trust tiers could still deploy but with visible trust badges — "registered" vs "discoverable" vs "verified" vs "full". The market prices in the difference.

## Clanker Integration (Under the Hood)

**Package:** `clanker-sdk` (TypeScript, works with viem)

```typescript
import { Clanker } from 'clanker-sdk';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';

const clanker = new Clanker({ wallet, publicClient });

const tokenAddress = await clanker.deployToken({
  name: "estmcmxci",
  symbol: "ESTMCMXCI",
  image: "ipfs://...",           // profile image
  metadata: {
    description: "Identity token for estmcmxci.eth — TRL verified",
    website: "https://estmcmxci.eth.limo",
    // social links, audit URLs
  },
  context: {
    interface: "synthesis-trl",
    platform: "web",
  },
  pool: {
    quoteToken: "0x4200000000000000000000000000000000000006", // WETH on Base
    initialMarketCap: "10",  // in ETH
  },
  rewardsConfig: {
    creatorReward: 80,
    creatorAdmin: "0xeb0ABB367540f90B57b3d5719fd2b9c740a15022",
    creatorRewardRecipient: "0xeb0ABB367540f90B57b3d5719fd2b9c740a15022",
  },
});
```

**What Clanker handles:**
- ERC-20 factory deployment on Base
- Automatic Uniswap V4 liquidity pool (WETH pair)
- 1.2% swap fee on all trades
- Fee distribution: up to 80% creator / remainder to protocol
- Fees accumulate in WETH + token, claimable anytime

**Supported chains:** Base (primary), Arbitrum, Unichain, Monad, Ethereum mainnet

**Key contracts:**
- Factory: `0xE85A59c628F7d27878ACeB4bf3b35733630083a9`
- Hook: `0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC`
- Locker: `0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496`

## Why This Matters

The identity token is not a vanity coin. It's the financialization of verifiable identity.

Traditional profile coins (friend.tech, pump.fun meme coins) have no identity layer — anyone can claim to be anyone. The token's value is pure speculation on social clout.

An identity token launched through the TRL has a verifiable claim:
- The deployer owns the ENS name (on-chain proof)
- The ENS name is registered in an identity registry (ERC-8004)
- The name resolves to a discoverable agent context (ENSIP-26)
- A signed, versioned manifest attests to who they are (AIP)
- Their capabilities are published on a domain they control (DVS)

The trust profile *is* the fundamentals. The token prices in the legibility.

## Build Sequence

This is Phase 2 — built after the TRL substrate and personal site are live.

1. **Integrate `clanker-sdk`** into the Next.js site
2. **Build the deployment flow** — wallet connect, TRL verification gate, token config UI
3. **Deploy $ESTMCMXCI** as the first identity token (dogfooding)
4. **Token profile page** — `/token/estmcmxci.eth` shows live price, trust profile, trading link
5. **Open the platform** — let any TRL-verified ENS name launch their own identity token
6. **Fee claiming UI** — dashboard for creators to claim accumulated WETH + token rewards

## Open Questions

- [ ] Minimum trust tier required to deploy? ("registered" might be too low, "full" might be too restrictive)
- [ ] Should the token symbol be derived from the ENS name automatically, or user-chosen?
- [ ] How to handle ENS names that lose verification after token deployment? (trust tier downgrade)
- [ ] Should there be a 1-token-per-ENS-name constraint, or can you deploy multiple?
- [ ] Initial market cap — fixed for all identity tokens, or configurable?
- [ ] Vesting vault — should identity tokens require the deployer to vest a percentage?
