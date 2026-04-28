# `@synthesis/resolver`

Trust Resolution Layer — ENS identity resolution, trust scoring, and the policy + signer primitives consumers compose against.

The resolver itself is **read-only**. It walks five resolution layers (Personhood, Identity, Context, Manifest, Skill) and returns a typed `TrustProfile`. The package also exports two write-side primitives — a pure `gate()` policy function and a uniform `Signer` interface — that consuming applications wire together as `resolve → gate → sign`.

## Install

```bash
pnpm add @synthesis/resolver
```

Peer deps: `viem ^2`, `zod ^3`. The Namera signer additionally requires `@namera-ai/sdk` and an ERC-4337 bundler.

## Quick start

### 1. Resolve + gate

```typescript
import { resolve, gate, type TrustPolicy } from "@synthesis/resolver";

const profile = await resolve("emilemarcelagustin.eth");

const policy: TrustPolicy = {
  minTier: "verified",
  requireLineage: true,
  requireSig: true,
  allowSelf: true,
};

const decision = gate(profile, policy);
//   → { allow: true, reason: "all gates passed at tier full", profile, policy }

if (!decision.allow) {
  throw new Error(decision.reason);
}
```

`gate()` is pure — no I/O, deterministic, first-match-wins across five branches. Full convention spec: [`spec/trust-policy.md`](../../spec/trust-policy.md).

### 2. Sign and broadcast

```typescript
import { createLocalSigner, type Batch } from "@synthesis/resolver";
import { base } from "viem/chains";

const signer = createLocalSigner({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  chain: base,
  rpc: "https://mainnet.base.org",
});

const batch: Batch = {
  chainId: base.id,
  atomic: false, // EOAs ignore atomic — see JSDoc
  calls: [{ to: "0x…", data: "0x…", value: 0n }],
};

const txHash = await signer.execute([batch]);
```

For smart-account signing with atomic batches and onchain policy lanes (call / gas / rate-limit / timestamp), use `createNameraSigner` instead — same `Signer` interface, ZeroDev kernel account underneath. IO is dependency-injected (`readSessionKey: () => Promise<string>`) so the package stays browser-bundler-safe.

## Exports

| Symbol | Kind | Notes |
|---|---|---|
| `resolve(name, opts?)` | function | Composes the 5-layer pipeline → `TrustProfile` |
| `resolvePersonhood`, `resolveIdentity`, `resolveContext`, `resolveManifest`, `resolveSkill` | functions | Per-layer resolvers, useful for partial reads |
| `gate(profile, policy, callerEns?)` | function | Pure policy decision over a `TrustProfile` |
| `TrustProfile`, `TrustTier`, `ManifestResult`, … | types + Zod schemas | Domain types from `./schema.js` |
| `TrustPolicy`, `GateDecision` | types + Zod schemas | Policy primitive types |
| `Signer`, `Batch` | interfaces | Uniform write-side abstraction |
| `createLocalSigner(opts)` | function | viem-based EOA adapter |
| `createNameraSigner(opts)` | async function | ZeroDev kernel-account adapter via `@namera-ai/sdk` |
| `createEnsClient`, `normalizeName`, `getTextRecord`, … | functions | ENS utilities (viem-backed) |
| `extractCid`, `fetchJsonFromIpfs`, `cidToUri`, … | functions | IPFS utilities |
| `encodeErc7930Address`, `buildEnsip25Key`, `KNOWN_REGISTRIES` | functions | ENSIP-25 / ERC-7930 helpers |

## What's new in 0.2.0

- `gate()` — pure policy primitive over a `TrustProfile`. Five decision branches with normative ordering. Reference: [`spec/trust-policy.md`](../../spec/trust-policy.md).
- `Signer` interface + `Batch` type — uniform write-side abstraction for EOA and smart-account signers.
- `createLocalSigner` — viem `WalletClient` over a private-key EOA. Rejects wrong-chain batches.
- `createNameraSigner` — ZeroDev kernel-account signer via `@namera-ai/sdk`. Execution-only (no owner-key requirement).
- `Batch.nonceKey` — optional ZeroDev nonce-lane key for parallel smart-account batches.

## CLI

The companion `@synthesis/cli` package wraps these primitives as `ensemble gate <name>` and `ensemble trust <name>`.

```bash
pnpm add -g @synthesis/cli
ensemble gate emilemarcelagustin.eth --min-tier verified
# Exit 0 on allow, 1 on deny. Add --format json for machine-readable output.
```

## Tests

```bash
pnpm test
```

Covers all 6 gate decision branches plus the signer adapter constructors. End-to-end signer broadcast testing is deferred to consumers (e.g. TrustSwap Phase 0's live Base swap).

## License

MIT.

## See also

- [`spec/trust-policy.md`](../../spec/trust-policy.md) — the gate convention spec
- [`plans/trl-policy-and-signers.md`](../../plans/trl-policy-and-signers.md) — execution plan that produced the 0.2.0 surface
- [`plans/trust-gated-swap.md`](../../plans/trust-gated-swap.md) — first downstream consumer (trust-gated Uniswap settlement)
