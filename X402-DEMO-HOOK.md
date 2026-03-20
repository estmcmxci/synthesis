# x402 Demo Hook — Trust-Gated Payments

How verifiable identity turns HTTP 402 into a trust decision.

---

## The Idea

Eskender's suggestion: "use the record set as identity then tie some usecase into that identity, like x402."

The Trust Resolution Layer already answers *who is this agent?* — x402 answers *how do I pay them?* Composing the two means an agent can **verify a provider's identity before paying**, and a provider can **gate access based on the requester's trust profile**. Neither protocol does this alone.

## Protocol Fit

x402 is Coinbase's open payment standard built on the HTTP 402 status code. A server responds with `402 Payment Required` + payment instructions in the `PAYMENT-REQUIRED` header. The client signs a stablecoin payment and retries with a `PAYMENT-SIGNATURE` header. A facilitator (Coinbase CDP) settles on Base or Solana.

Key properties that make this composable with TRL:

| x402 | TRL | Together |
|------|-----|----------|
| Tells you *how much* to pay | Tells you *who* you're paying | Pay only verified agents |
| Stateless HTTP — no accounts | ENS name — no accounts | Identity without auth |
| Base-native (USDC) | Base-native (ERC-8004) | Single chain, single flow |
| 402 header = machine-readable | Trust profile = machine-readable | Agents compose both autonomously |

## Demo Flow

```
Agent A (requester)                          Agent B (provider)
     |                                            |
     |  GET /api/resolve?name=vitalik.eth         |
     |  ----------------------------------------> |
     |                                            |
     |  402 Payment Required                      |
     |  PAYMENT-REQUIRED: {                       |
     |    amount: "0.01",                         |
     |    token: "USDC",                          |
     |    chain: "eip155:8453",                   |
     |    facilitator: "...",                     |
     |    x-trust-provider: "agentb.eth"  ← NEW  |
     |  }                                         |
     |  <---------------------------------------- |
     |                                            |
     |  [TRL: resolve("agentb.eth")]              |
     |  → ENSIP-25: verified ✓                    |
     |  → ENSIP-26: agent-context found ✓         |
     |  → AIP: manifest signed, lineage intact ✓  |
     |  → DVS: SKILL.md on verified domain ✓      |
     |  → Trust tier: "full"                      |
     |                                            |
     |  [Decision: trust tier ≥ "verified" → pay] |
     |                                            |
     |  GET /api/resolve?name=vitalik.eth         |
     |  PAYMENT-SIGNATURE: { signed USDC tx }     |
     |  ----------------------------------------> |
     |                                            |
     |  [Facilitator settles on Base]             |
     |  200 OK + { resolution data }              |
     |  <---------------------------------------- |
```

The critical addition: between receiving the 402 and sending payment, Agent A resolves Agent B's trust profile. This is the "trust gate" — the agent refuses to pay unverified providers.

## How It Ties Into Existing Docs

### → ONE-PAGER.md (Hackathon Submission)

x402 becomes the concrete use case that demonstrates why trust resolution matters. The one-pager's "Why This Wins" section says the project is "not theoretical — built on live infrastructure." x402 makes this tangible: a live payment that only executes after trust verification.

Deliverable #2 ("Live demo — resolve any ENS name through all 4 layers") becomes: resolve the name, then pay/refuse based on the result.

### → AIP Spec (Agent Identity Profile)

The AIP manifest's `payload` field is free-form by design. For x402-enabled agents, the payload carries payment policy:

```json
{
  "schema": "ens.agent/1",
  "ensName": "agentb.eth",
  "version": "v1",
  "prev": null,
  "payload": {
    "endpoints": ["https://api.agentb.xyz"],
    "capabilities": ["trust-resolution", "ens-lookup"],
    "x402": {
      "enabled": true,
      "token": "USDC",
      "chain": "eip155:8453",
      "facilitator": "https://x402.org/facilitator",
      "pricing": {
        "/api/resolve": "0.01",
        "/api/bulk-resolve": "0.05"
      }
    }
  },
  "signature": { "scheme": "evm-owner-signature", "value": "0x..." }
}
```

This means an agent can discover *that* a provider accepts x402 payments, *what* they charge, and *on which chain* — all from the signed manifest, before making any HTTP request.

### → IDENTITY-TOKEN.md

x402 and the identity token are complementary, not competing:

- **x402** = earn revenue from services (pay-per-call, API access)
- **Identity token** = earn revenue from attention/reputation (trading fees)

Both are gated by the same TRL verification. A fully verified agent could offer paid API services via x402 *and* have a tradeable identity token — two revenue streams from one trust profile.

### → context.md (SKILL.md / DVS)

The SKILL.md file is where an agent publishes its interaction protocol. For x402-enabled agents, the SKILL.md includes:

```markdown
## Payment
This agent accepts x402 payments on Base (USDC).
- Pricing: $0.01 per resolution call
- Facilitator: Coinbase CDP
- Header: PAYMENT-SIGNATURE with signed USDC authorization
```

This is the "capability" layer (Layer 4) in the trust stack — DVS-verified instructions on how to pay.

### → agent-skill-8004-25.md (Celonames/ERC-8004)

The Celonames guide already lists "Integrate x402 payments for agent services" as a next step. This demo hook is that integration — proving it works on Base first (where ERC-8004 is already deployed), with Celo as a future expansion.

### → PRD.md

The PRD's `TrustProfile` interface doesn't need to change. The x402 demo is a *consumer* of the trust profile, not a modification to it. The demo reads the trust tier and makes a pay/refuse decision. This validates the PRD's design: the resolver is read-only, use cases are layered on top.

## Implementation Sketch

### Server (Agent B — the provider)

```typescript
import { x402 } from '@coinbase/x402';
import { resolve } from '@synthesis/resolver';

// Express/Hono middleware
app.use('/api/*', async (req, res, next) => {
  const payment = req.headers['payment-signature'];

  if (!payment) {
    return res.status(402).json({
      amount: '0.01',
      token: 'USDC',
      chain: 'eip155:8453',
      facilitator: 'https://x402.org/facilitator',
      'x-trust-provider': 'estmcmxci.eth',
    });
  }

  // Verify payment via facilitator
  const settled = await x402.verify(payment);
  if (!settled.valid) return res.status(402).json({ error: 'payment invalid' });

  next();
});
```

### Client (Agent A — the requester)

```typescript
import { resolve } from '@synthesis/resolver';
import { x402Client } from '@coinbase/x402';

async function callPaidEndpoint(url: string, providerName: string) {
  // Step 1: Verify provider identity
  const profile = await resolve(providerName);

  if (profile.trustScore === 'none') {
    throw new Error(`Refusing to pay unverified agent: ${providerName}`);
  }

  // Step 2: Make x402-authenticated request
  const response = await x402Client.fetch(url, {
    wallet,
    maxPayment: '0.10', // safety cap
  });

  return response.json();
}
```

## What We Demo at Synthesis

1. **estmcmxci.eth as live provider** — all 4 TRL layers configured, x402 endpoint serving trust resolution as a paid API
2. **Live payment** — Agent A queries, gets 402, resolves trust profile, pays USDC on Base, gets result
3. **Trust gate in action** — show what happens when the provider is unverified (payment refused)
4. **Visualization** — the demo UI shows the trust profile resolving in real-time alongside the payment flow

This is the "record set as identity, x402 as use case" that Eskender described — composed into a single verifiable flow.

## References

- [x402 Specification](https://github.com/coinbase/x402/blob/main/specs/x402-specification.md)
- [x402 Official Site](https://www.x402.org/)
- [Coinbase x402 Docs](https://docs.cdp.coinbase.com/x402/welcome)
- [x402 Whitepaper](https://www.x402.org/x402-whitepaper.pdf)
- [Cloudflare x402 Foundation Announcement](https://blog.cloudflare.com/x402/)
