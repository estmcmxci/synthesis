# ChatKit Proxy API — Token-Gated Chat Access

A lightweight Hono server in TypeScript. New package: `packages/api`. Runs on the same VPS, sits between ChatKit and the OpenClaw gateway.

---

## Three Endpoints

### `POST /api/session` — the door

- Frontend sends: wallet address + signed message (proves ownership)
- Server verifies signature
- Checks `$ESTMCMXCI` balance on Base via viem — if zero, return `403`
- Checks EAS attestation — if early witness, grants higher quota
- Mints a short-lived ChatKit session secret
- Returns secret to ChatKit — it uses this for all subsequent calls

### `POST /v1/chat/completions` — the proxy

- Validates session secret
- Checks wallet's monthly quota (Redis or simple JSON file)
- If within free quota → proxy directly to `localhost:18789/v1/chat/completions`
- If over quota → return `402` with x402 payment details (USDC on Base, $0.02/call)
- Once payment verified → proxy the request, decrement quota

### `GET /api/quota` — the meter

- Returns wallet's remaining free calls, usage, and tier.

## Quota Tiers

| Who | Free quota | Over quota |
|-----|-----------|------------|
| Early witness (EAS attested) | 100 calls/month | $0.02/call via x402 |
| Token holder | 50 calls/month | $0.02/call via x402 |
| Owner wallet | Unlimited | — |

## File Structure

```
packages/api/
  src/
    index.ts          — Hono app, route definitions
    session.ts        — wallet verify + secret minting
    proxy.ts          — OpenClaw gateway proxy
    quota.ts          — usage tracking + x402 gate
    token.ts          — $ESTMCMXCI balance check via viem
    attestation.ts    — EAS early witness check
  package.json
  tsconfig.json
```

## Dependencies

- **hono** — lightweight TypeScript server
- **viem** — already in monorepo, token balance reads
- **@synthesis/resolver** — workspace import, TRL checks
- **x402** — payment verification

## Config (env vars)

```
OPENCLAW_GATEWAY_TOKEN=...
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
TOKEN_CONTRACT=<$ESTMCMXCI address, set at launch>
BASE_RPC_URL=...
OWNER_WALLET=0xeb0ABB...
```

## Notes

Fits cleanly into the existing monorepo as `packages/api`. The token gate ties directly into the early witness mechanics described in `GTM.md` — EAS attestations determine quota tiers. The x402 overage path is the first revenue surface that isn't the token itself.
