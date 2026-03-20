# Agent Wallet — Self-Sovereign Spending Infrastructure

## Core Design Decision

The agent's wallet is a **smart account** owned by a **biometric passkey**. The human's body is the root of trust. The agent gets a scoped session key — not the owner key, not a custodied key, not an email OTP. A cryptographic capability bound to policy.

```
Biometric (Face ID / fingerprint)
  |
  v
Passkey (Secure Enclave, non-exportable, WebAuthn)
  |
  v
Safe Smart Account on Base (passkey = owner signer)
  |
  v
Session Key Module (agent's scoped access)
  |  - Allowed contracts (USDC, Uniswap, Clanker)
  |  - Per-tx limits, daily caps
  |  - Time-bounded (auto-expire)
  |  - Revocable instantly by passkey holder
  |
  v
Agent operates autonomously within bounds
```

No seed phrase. No private key in a `.env`. No custodian. The passkey lives in hardware, requires your biometric to sign, and cannot be exported. This is the strongest "soul binding" available — stronger than anything Coinbase, Bankr, or any custodial wallet can offer.

---

## Why Not Coinbase Agentic Wallet

| | Coinbase Agentic Wallet | Synthesis Agent Wallet |
|---|---|---|
| **Root of trust** | Email OTP (phishable) | Biometric passkey (hardware-bound) |
| **Key custody** | Coinbase holds keys | No one holds keys — Secure Enclave |
| **Identity** | Email address | ENS + ERC-8004 + TRL |
| **Spend policy** | Coinbase-defined limits | TRL trust-tier-scoped, on-chain |
| **Agent auth** | API key from Coinbase | Session key from smart account |
| **Revocation** | Ask Coinbase | Sign with your face |
| **Verifiability** | Trust Coinbase | Verify on-chain |

Coinbase gives agents a bank account. We give agents an identity-scoped cryptographic capability backed by the owner's biometric.

---

## Architecture

### The Smart Account

A **Safe smart account** on Base, configured with:

- **Owner**: WebAuthn passkey signer (the human's biometric)
- **Module**: Session key validator (Rhinestone SmartSession or equivalent)
- **4337 compatible**: Transactions go through ERC-4337 EntryPoint, enabling gasless operations via paymaster

```
Safe Smart Account (Base)
  Owner: Passkey (WebAuthn signer)
  Modules:
    - Safe4337Module (ERC-4337 compatibility)
    - SmartSession (session key validation + policy enforcement)
  Holds: USDC, WETH, identity tokens, ERC-20s
```

### Key Hierarchy

```
Level 0: Passkey (biometric)
  - Full control: add/remove owners, enable/disable modules, move all funds
  - Recovery: can restore access if agent key is compromised
  - Cannot be extracted, copied, or delegated

Level 1: Session Key (agent)
  - Scoped access: only allowed contracts, functions, amounts
  - Time-bounded: auto-expires, must be renewed by passkey holder
  - Revocable: passkey holder can kill instantly, on-chain
  - Serializable: can be passed to agent as a token string
```

### Session Key Policies

Each session key is bound to a policy set enforced on-chain by the SmartSession module. Policies are composable:

| Policy | Purpose | Example |
|--------|---------|---------|
| **Call Policy** | Restrict target contracts + function selectors | Only USDC `transfer()`, only Uniswap `exactInputSingle()` |
| **Spending Limit** | Cumulative token spend per period | Max 500 USDC/day |
| **Value Limit** | Max ETH value per transaction | Max 0.1 ETH per tx |
| **Time Frame** | Valid-after / valid-until | Session expires in 7 days |
| **Rate Limit** | Max N calls per interval | Max 10 transactions/hour |

These map directly to TRL trust tiers:

| TRL Trust Tier | Session Policy |
|----------------|---------------|
| `full` | High limits, broad contract allowlist, 30-day sessions |
| `verified` | Moderate limits, core contracts only, 7-day sessions |
| `discoverable` | Low limits, USDC transfers only, 24-hour sessions |
| `registered` | Micro-transactions, single contract, 1-hour sessions |
| `none` | No session key issued |

---

## Implementation Stack

### Smart Account Layer

```
Safe v1.4.1 (ERC-7579 modular)
  + Safe4337Module v0.3.0
  + Safe WebAuthn Signer (passkey as owner)
  + Rhinestone SmartSession Module (session keys + policies)
```

**Key contracts on Base:**
- Safe Singleton: `0x41675C099F32341bf84BFc5382aF534df5C7461a`
- SafeProxyFactory: `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`
- Safe4337Module: `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`
- EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- Rhinestone Module Registry: `0x000000000069E2a187AEFFb852bF3cCdC95151B2`

### Infrastructure

| Component | Service | Purpose |
|-----------|---------|---------|
| **Bundler** | Pimlico | Submits UserOperations to Base |
| **Paymaster** | Pimlico | Sponsors gas so agent doesn't need ETH |
| **RPC** | Base public / Alchemy | Contract reads, event indexing |
| **Session storage** | Agent's local env | Serialized session key token |

### SDK Dependencies

```json
{
  "@safe-global/protocol-kit": "latest",
  "@safe-global/relay-kit": "latest",
  "@rhinestone/module-sdk": "latest",
  "permissionless": "latest",
  "viem": "^2.x"
}
```

### Alternative: ZeroDev Kernel

If Safe + Rhinestone proves too heavy, ZeroDev Kernel is a lighter path with better session key DX:

```json
{
  "@zerodev/sdk": "latest",
  "@zerodev/permissions": "latest",
  "permissionless": "latest",
  "viem": "^2.x"
}
```

ZeroDev advantages:
- Built-in session serialization (`serializePermissionAccount` / `deserializePermissionAccount`)
- Simpler policy composition API
- Integrated bundler + paymaster

ZeroDev tradeoffs:
- No multi-sig (Safe supports n-of-m owners natively)
- Smaller ecosystem than Safe
- Less battle-tested at scale

**Decision**: Start with Safe (already in our hosting layer, passkey signer support, multi-sig for future multi-owner scenarios). Fall back to ZeroDev if integration friction is too high.

---

## Flows

### 1. Wallet Creation (Human, One-Time)

```
Human visits site → connects passkey (WebAuthn prompt)
  |
  v
Site predicts Safe address (CREATE2 deterministic)
  |
  v
First transaction deploys the Safe
  - Owner: passkey public key (WebAuthn signer)
  - Modules: Safe4337Module + SmartSession enabled
  |
  v
Safe address registered as the agent's wallet
  - Linked to ENS name via TRL
  - Funded with USDC (manual or bridged)
```

### 2. Session Key Issuance (Human, Periodic)

```
Human authenticates with passkey (biometric)
  |
  v
Site generates ephemeral keypair for the agent
  |
  v
Human configures session policy:
  - Allowed contracts + functions
  - Spending limits (derived from TRL trust tier)
  - Expiry (7 days default)
  |
  v
Human signs session creation (passkey → UserOp → on-chain)
  |
  v
Serialized session key token passed to agent
  (stored in agent's environment, never exposed)
```

### 3. Agent Transaction (Agent, Autonomous)

```
Agent needs to pay for something
  |
  v
Agent deserializes session key
  |
  v
Agent constructs UserOperation:
  - target: allowed contract (e.g., USDC)
  - data: allowed function (e.g., transfer)
  - Signed with session key
  |
  v
UserOp → Bundler (Pimlico)
  → EntryPoint validates
  → Safe4337Module dispatches
  → SmartSession checks policies
  → If pass: execute. If fail: revert.
  |
  v
Transaction confirmed on Base (~2s)
```

### 4. Revocation (Human, Emergency)

```
Human authenticates with passkey
  |
  v
Site calls removeSession on SmartSession module
  (signed by passkey → UserOp → on-chain)
  |
  v
Session key is immediately invalid
  Next UserOp from that key will revert
```

---

## x402 Integration

The x402 protocol enables agent-to-agent paid API calls. With TRL, we add trust verification:

```
Agent A calls Agent B's API endpoint
  |
  v
HTTP 402 Payment Required
  {
    amount: "0.01 USDC",
    payTo: "agentB.eth",
    chain: "eip155:8453",
    trustRequired: "verified"
  }
  |
  v
Agent A resolves agentB.eth via TRL
  - Is this a real agent? What trust tier?
  - Does the payment address match their registered wallet?
  |
  v
If TRL checks pass:
  Agent A signs USDC transfer via session key
  → UserOp → Bundler → Base
  |
  v
Agent A includes payment proof in retry request
  X-Payment: <tx-hash>
  |
  v
Agent B verifies payment on-chain
  Agent B resolves agentA.eth via TRL
  → Trust-scoped response (higher trust = more data)
```

**Coinbase's x402 has no identity verification.** You're paying an address with no way to verify who's behind it. TRL-gated x402 means both sides verify each other before money moves.

---

## Relationship to Other Layers

This wallet infrastructure serves both Layer 3 (Identity Token) and Layer 4 (Agent Card):

```
Safe Smart Account (this spec)
  |
  +--- Identity Token (Layer 3)
  |     Agent deploys via Clanker using session key
  |     Allowed contract: Clanker Factory
  |     Policy: one deployment per session
  |
  +--- x402 Payments (agent-to-agent)
  |     Agent pays other agents via session key
  |     Policy: per-tx USDC limit
  |     TRL verification on both sides
  |
  +--- Agent Card (Layer 4)
  |     USDC locked from Safe → card collateral
  |     Card issuer (Immersve) reads balance
  |     Spend limits enforced by both smart contract AND card API
  |
  +--- Crypto Payments (native)
        Swaps, transfers, contract calls
        All scoped by session key policies
```

---

## Gas Costs on Base

| Operation | Estimated Gas | Estimated Cost (Base) |
|-----------|--------------|----------------------|
| Safe deployment | ~300,000 | ~$0.02-0.05 |
| Session key creation | ~150,000 | ~$0.01-0.03 |
| USDC transfer (via session key) | ~120,000-180,000 | ~$0.01-0.02 |
| Session revocation | ~50,000 | ~$0.005 |

With a paymaster, the agent pays zero gas. The paymaster can be funded by the platform or sponsored per-session.

---

## Open Questions

- [ ] Safe vs ZeroDev: need to prototype both and compare DX for session key creation + agent-side usage
- [ ] Passkey recovery: what happens if the device is lost? Social recovery module? Backup passkey on second device?
- [ ] Session renewal: auto-renew sessions before expiry, or require human re-authentication each time?
- [ ] Multi-agent: can one Safe issue session keys to multiple agents with independent policies?
- [ ] Paymaster funding: who pays for gas? Platform-sponsored, or deducted from agent's USDC balance?
- [ ] x402 standard: adopt Coinbase's spec as-is, or propose a TRL-extended variant?
- [ ] Session key storage: where does the agent securely store its serialized session? Encrypted at rest?

---

## Build Sequence

```
Phase 0: Prototype
  +-- Deploy a Safe on Base with WebAuthn passkey owner
  +-- Enable SmartSession module
  +-- Create a session key with USDC transfer policy
  +-- Agent sends a USDC transfer using session key
  +-- Verify policy enforcement (exceed limit → revert)

Phase 1: Integration
  +-- Wire session key policies to TRL trust tiers
  +-- Build session creation UI (passkey auth → configure → issue)
  +-- Build agent-side SDK (deserialize session, construct UserOps)
  +-- Integrate with Pimlico bundler + paymaster on Base

Phase 2: x402
  +-- Implement TRL-gated x402 payment flow
  +-- Agent-to-agent payment + verification
  +-- Trust-scoped API responses

Phase 3: Production
  +-- Session management dashboard (view, revoke, renew)
  +-- Multi-agent support (multiple session keys per Safe)
  +-- Passkey recovery flow (backup device, social recovery module)
  +-- Audit session key module + policy contracts
```
