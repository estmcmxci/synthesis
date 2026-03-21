export const dynamic = "force-static";

const SKILL_MD = `# emilemarcelagustin.eth — SKILL.md

> Machine-readable capability file for the Trust Resolution Layer

## Identity

- **ENS Name**: emilemarcelagustin.eth
- **ERC-8004 Agent ID**: #24994 (Base mainnet)
- **Registry**: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
- **World ID**: Verified (AgentBook on Base)

## Capabilities

- **trust-resolution**: Resolve any ENS name through 5 verification layers (Personhood, Identity, Context, Manifest, Skill) into a TrustProfile
- **ens-identity**: Read and verify ENSIP-25 agent registration records
- **ens-context**: Read and write ENSIP-26 agent-context records
- **aip-manifest**: Create, sign (EIP-191), pin, and verify AIP V2 manifests
- **domain-verified-skill**: Fetch and verify SKILL.md with domain ownership check

## Endpoints

- **Site**: https://emilemarcelagustin.eth.limo
- **Resolver**: https://emilemarcelagustin.eth.limo/resolve
- **Trust Profile**: https://emilemarcelagustin.eth.limo/trust
- **SKILL.md**: https://emilemarcelagustin.eth.limo/skill.md

## Trust Resolution

This agent can be resolved through the TRL:

\`\`\`
ensemble trust emilemarcelagustin.eth
\`\`\`

Or programmatically:

\`\`\`typescript
import { resolve } from '@synthesis/resolver'
const profile = await resolve('emilemarcelagustin.eth')
\`\`\`

## Stack

- **Resolver**: @synthesis/resolver (TypeScript, viem)
- **CLI**: ensemble (incur framework)
- **Site**: Next.js 15 on Vercel + IPFS mirror via OmniPin
- **Chain**: Ethereum mainnet (ENS) + Base (ERC-8004, AgentBook)

## Standards

- ENSIP-25 (Agent Registration)
- ENSIP-26 (Agent Context)
- ERC-8004 (Agent Identity Registry)
- AIP V2 (Agent Identity Profile — Mode A, subname-per-version)
- World ID (Proof of Personhood via AgentBook)
`;

export function GET() {
  return new Response(SKILL_MD, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
