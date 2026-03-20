---
name: decentralized-web-stack
description: Scaffold and deploy a censorship-resistant website from a monorepo using IPFS + ENS + OmniPin + Safe multisig. Framework-agnostic — any static output works.
version: 2026-03-06
trigger: When a user asks to deploy a decentralized frontend, set up an ENS website, IPFS hosting, censorship-resistant app, or dweb stack.
priority: high
---

# Decentralized Web Stack — Full Implementation Skill

Deploy a censorship-resistant website from a monorepo. The stack:
- **ENS** — decentralized domain (content hash record)
- **IPFS** — decentralized storage (pinned static files)
- **OmniPin** — deployment orchestration (build -> pin -> propose tx)
- **Safe multisig** — secure content hash updates (multi-signer approval)
- **ETH.LIMO** — public gateway (resolves `<name>.eth.limo`)

## Why This Exists

Web2 infrastructure is the weakest link in crypto apps:
- DNS seizure (Tornado Cash), DNS hijacking (Balancer, Curve, Aerodrome)
- Deployment compromise (Safe), CDN outages (Cloudflare at DevConnect)
- A protocol cannot claim meaningful decentralization without a decentralized frontend

## Constraints

- **Static files only.** IPFS serves static content. No SSR, no server functions, no API routes.
- **Any framework works** as long as it outputs static HTML/CSS/JS: Next.js (`output: 'export'`), Vite, Astro, SvelteKit (`adapter-static`), plain HTML.
- **SPA routing caveat**: IPFS has no server-side redirects. Use hash routing (`/#/page`) or generate all routes at build time. Include a `_redirects` or `404.html` fallback.

---

## 1. Monorepo Scaffold

```
project-root/
  package.json              # pnpm workspace root
  pnpm-workspace.yaml
  turbo.json
  apps/
    web/                    # The static website (any framework)
      package.json
      dist/                 # Build output (static files)
  packages/
    dweb-deploy/            # OmniPin config + deployment scripts
      package.json
      omnipin.config.ts
      scripts/
        deploy.sh           # Build + pin + propose Safe tx
        verify-cid.sh       # Verify CID matches local build
      src/
        validate-static.ts  # Ensures build output is static-only
  .github/
    workflows/
      deploy-dweb.yml       # CI/CD: scheduled or manual trigger
```

### Root package.json

```json
{
  "name": "dweb-monorepo",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "deploy:dweb": "turbo run build && pnpm --filter dweb-deploy run deploy",
    "validate:static": "pnpm --filter dweb-deploy run validate"
  },
  "devDependencies": {
    "turbo": "^2"
  }
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "outputs": ["dist/**", "out/**", ".next/**"]
    },
    "deploy": {
      "dependsOn": ["build"]
    }
  }
}
```

---

## 2. Static Build Validation

Before any deployment, verify the build output contains only static files. No server bundles, no API routes, no dynamic imports that require a runtime.

### packages/dweb-deploy/src/validate-static.ts

```typescript
import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ALLOWED_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".mjs", ".json",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".eot",
  ".xml", ".txt", ".webmanifest", ".map",
]);

const FORBIDDEN_PATTERNS = [
  /server\//i,
  /api\//i,
  /\.server\./i,
  /middleware\./i,
  /next-server/i,
];

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

export async function validateStaticOutput(distDir: string): Promise<void> {
  const files = await walk(distDir);

  if (files.length === 0) {
    throw new Error(`No files found in ${distDir}. Did the build succeed?`);
  }

  const hasIndex = files.some((f) => f.endsWith("/index.html"));
  if (!hasIndex) {
    throw new Error(`No index.html found in ${distDir}. IPFS needs an index.html entry point.`);
  }

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) && ext !== "") {
      console.warn(`Warning: unexpected file type ${ext} — ${file}`);
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(file)) {
        throw new Error(
          `Forbidden server-side file detected: ${file}\n` +
          `IPFS only serves static files. Remove SSR/API routes.`
        );
      }
    }
  }

  const totalSize = (await Promise.all(files.map((f) => stat(f)))).reduce(
    (sum, s) => sum + s.size, 0
  );
  const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
  console.log(`Static validation passed: ${files.length} files, ${sizeMB} MB`);
}
```

### packages/dweb-deploy/package.json

```json
{
  "name": "dweb-deploy",
  "private": true,
  "type": "module",
  "scripts": {
    "validate": "tsx src/validate-static.ts ../apps/web/dist",
    "deploy": "bash scripts/deploy.sh"
  },
  "devDependencies": {
    "tsx": "^4"
  }
}
```

---

## 3. OmniPin Configuration

OmniPin orchestrates: build output -> IPFS pin -> ENS content hash update (optionally via Safe).

### Install OmniPin

```bash
pnpm add -D @omnipin/cli --filter dweb-deploy
```

### packages/dweb-deploy/omnipin.config.ts

```typescript
import { defineConfig } from "@omnipin/cli";

export default defineConfig({
  // Directory containing static build output
  directory: "../apps/web/dist",

  // IPFS pinning providers (pin to multiple for redundancy)
  pinning: {
    providers: ["pinata", "web3storage"],
    // API keys from environment
    pinata: {
      apiKey: process.env.PINATA_API_KEY,
      secretKey: process.env.PINATA_SECRET_KEY,
    },
    web3storage: {
      token: process.env.W3S_TOKEN,
    },
  },

  // ENS content hash update
  ens: {
    name: process.env.ENS_NAME, // e.g. "myprotocol.eth"
    // Chain to set content hash on (mainnet or L2 with CCIP-Read)
    chain: "mainnet",
    rpc: process.env.RPC_URL || "https://eth.drpc.org",
  },

  // Safe multisig — propose tx instead of executing directly
  safe: {
    address: process.env.SAFE_ADDRESS,
    chain: "mainnet",
    // OmniPin proposes the tx; signers approve in Safe UI
    proposer: process.env.PROPOSER_PRIVATE_KEY,
  },
});
```

---

## 4. Deployment Script

### packages/dweb-deploy/scripts/deploy.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${DIST_DIR:-../../apps/web/dist}"
ENS_NAME="${ENS_NAME:?Set ENS_NAME (e.g. myprotocol.eth)}"

echo "=== Step 1: Validate static output ==="
pnpm tsx src/validate-static.ts "$DIST_DIR"

echo "=== Step 2: Deploy to IPFS + propose ENS update ==="
# OmniPin handles: pin to IPFS -> get CID -> propose Safe tx to update content hash
npx omnipin deploy "$DIST_DIR" \
  --name "$ENS_NAME" \
  --safe "$SAFE_ADDRESS" \
  --provider pinata \
  --provider web3storage

echo "=== Done ==="
echo "Safe transaction proposed. Signers must approve in the Safe UI."
echo "Once executed, site will be live at: https://${ENS_NAME%.eth}.eth.limo"
```

### packages/dweb-deploy/scripts/verify-cid.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

# Verify that the CID on-chain matches a local build
ENS_NAME="${ENS_NAME:?Set ENS_NAME}"
DIST_DIR="${DIST_DIR:-../../apps/web/dist}"

echo "Fetching on-chain content hash for $ENS_NAME..."
ONCHAIN_CID=$(cast call \
  "$(cast resolve-name "$ENS_NAME" --rpc-url https://eth.drpc.org)" \
  "contenthash(bytes32)" \
  "$(cast namehash "$ENS_NAME")" \
  --rpc-url https://eth.drpc.org)

echo "On-chain CID: $ONCHAIN_CID"

echo "Computing local CID from $DIST_DIR..."
LOCAL_CID=$(npx omnipin cid "$DIST_DIR")
echo "Local CID:    $LOCAL_CID"

if [ "$ONCHAIN_CID" = "$LOCAL_CID" ]; then
  echo "MATCH — on-chain content hash matches local build"
else
  echo "MISMATCH — content hash differs. Redeploy needed."
  exit 1
fi
```

---

## 5. CI/CD — GitHub Actions

### .github/workflows/deploy-dweb.yml

```yaml
name: Deploy Decentralized Website

on:
  # Manual trigger
  workflow_dispatch:
  # Scheduled (first of every month)
  schedule:
    - cron: "0 0 1 * *"

env:
  ENS_NAME: ${{ vars.ENS_NAME }}
  SAFE_ADDRESS: ${{ vars.SAFE_ADDRESS }}
  PINATA_API_KEY: ${{ secrets.PINATA_API_KEY }}
  PINATA_SECRET_KEY: ${{ secrets.PINATA_SECRET_KEY }}
  W3S_TOKEN: ${{ secrets.W3S_TOKEN }}
  PROPOSER_PRIVATE_KEY: ${{ secrets.PROPOSER_PRIVATE_KEY }}
  RPC_URL: ${{ secrets.RPC_URL }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # Build the static site
      - run: pnpm run build

      # Validate + deploy + propose Safe tx
      - run: pnpm run deploy:dweb

      - name: Summary
        run: |
          echo "## Deployment Complete" >> $GITHUB_STEP_SUMMARY
          echo "- ENS name: \`$ENS_NAME\`" >> $GITHUB_STEP_SUMMARY
          echo "- Safe tx proposed to: \`$SAFE_ADDRESS\`" >> $GITHUB_STEP_SUMMARY
          echo "- Gateway URL: https://${ENS_NAME%.eth}.eth.limo" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Next**: Approve the transaction in the [Safe UI](https://app.safe.global)." >> $GITHUB_STEP_SUMMARY
```

---

## 6. Environment Variables

Create a `.env.example` at the project root:

```bash
# ENS
ENS_NAME=myprotocol.eth

# Safe multisig
SAFE_ADDRESS=0x...
PROPOSER_PRIVATE_KEY=   # Key of a Safe signer (used to propose, not execute)

# IPFS pinning (at least one required)
PINATA_API_KEY=
PINATA_SECRET_KEY=
W3S_TOKEN=

# RPC
RPC_URL=https://eth.drpc.org
```

**Never commit `.env` files.** Add `.env*` to `.gitignore`.

---

## 7. Gateway Access

### Public gateway

The primary access point is `https://<name>.eth.limo`. ETH.LIMO resolves the ENS content hash, fetches from IPFS, and serves the content.

Example: `https://myprotocol.eth.limo`

### Self-hosted gateway (recommended backup)

For resilience, run your own IPFS gateway:

```bash
# Install IPFS (Kubo)
brew install ipfs

# Initialize and start
ipfs init
ipfs daemon

# Pin your CID locally
ipfs pin add <your-cid>

# Access at http://localhost:8080/ipfs/<your-cid>
```

For production self-hosting, use Nginx as a reverse proxy in front of the IPFS gateway, with your own domain pointing to it as a fallback.

### DNS fallback strategy

Point your Web2 domain to the same static content as a fallback:

```
myprotocol.com       -> Vercel/Netlify (Web2, fast CDN)
myprotocol.eth.limo  -> IPFS via ETH.LIMO (decentralized)
```

If the Web2 domain goes down, users access via the ENS gateway. If the gateway goes down, users access via Web2. Both serve identical static content from the same build.

---

## 8. Framework-Specific Build Commands

The skill is framework-agnostic. Here's how to get static output from common frameworks:

| Framework | Config | Build Command | Output Dir |
|-----------|--------|---------------|------------|
| **Vite** | (default) | `vite build` | `dist/` |
| **Next.js** | `output: 'export'` in next.config | `next build` | `out/` |
| **Astro** | (default static) | `astro build` | `dist/` |
| **SvelteKit** | `@sveltejs/adapter-static` | `vite build` | `build/` |
| **Plain HTML** | n/a | `cp -r src/ dist/` | `dist/` |

Set `DIST_DIR` in your deploy script to match your framework's output directory.

### SPA Routing on IPFS

IPFS has no server-side routing. Options:
1. **Pre-render all routes** at build time (recommended)
2. **Hash routing** (`/#/about` instead of `/about`)
3. **404.html fallback** — copy `index.html` to `404.html` so gateways serve your app for unknown paths

---

## 9. Safe Multisig Flow

The deployment flow with Safe:

```
CI builds static site
       |
OmniPin pins to IPFS (gets CID)
       |
OmniPin proposes Safe tx:
  "Set content hash of <name>.eth to ipfs://<CID>"
       |
Signer 1 receives notification, reviews CID, signs
       |
Signer 2 reviews, signs (meets threshold)
       |
Safe executes tx on-chain
       |
Content hash updated -> eth.limo serves new site
```

**Security properties:**
- No single person can push a malicious frontend
- CID is deterministic — same source always produces same hash
- Signers can independently verify the CID matches the expected build
- On-chain record is immutable once set (until next update)

---

## 10. Security Checklist

- [ ] **Multisig deploys**: Content hash updates go through Safe, never a single EOA
- [ ] **Verify CID before signing**: Run `verify-cid.sh` or rebuild locally to confirm
- [ ] **No secrets in frontend**: Static sites are fully public. No API keys, no private endpoints
- [ ] **Pin to multiple providers**: At least 2 IPFS pinning services for redundancy
- [ ] **Reproducible builds**: Lock dependency versions. Same source -> same CID
- [ ] **CSP headers**: If using a custom gateway, set Content-Security-Policy headers
- [ ] **Subresource integrity**: Use SRI hashes for external scripts (if any)
- [ ] **No external dependencies**: Ideal dweb site has zero external API calls. Bundle everything.
- [ ] **Test on gateway**: Always verify via `<name>.eth.limo` after content hash update
- [ ] **Rotate proposer key**: The Safe proposer key can propose but not execute. Rotate periodically.

---

## Quick Start

```bash
# 1. Clone / init monorepo
mkdir my-dweb && cd my-dweb
pnpm init
# Set up pnpm-workspace.yaml, turbo.json per above

# 2. Add your static site to apps/web/
# (any framework — just ensure it outputs static files)

# 3. Set up dweb-deploy package
mkdir -p packages/dweb-deploy/scripts packages/dweb-deploy/src
# Copy config files from this skill

# 4. Install deps
pnpm install

# 5. Build and validate
pnpm run build
pnpm run validate:static

# 6. Deploy (first time — manual to verify)
ENS_NAME=myprotocol.eth SAFE_ADDRESS=0x... pnpm run deploy:dweb

# 7. Approve Safe tx in the Safe UI

# 8. Verify at https://myprotocol.eth.limo
```

---

## References

- OmniPin: https://omnipin.io
- ETH.LIMO gateway: https://eth.limo
- ENS content hash docs: https://docs.ens.domains/web/content-hash
- IPFS pinning: https://docs.pinata.cloud, https://web3.storage
- Safe multisig: https://app.safe.global
- Greg Skirloff talk: "Building Resilient Websites With ENS" (ETHGlobal / ENS)
- Vitalik's blog migration: vitalik.eth -> vitalik.eth.limo
