# Plan: `/agent/<ens-name>` TRL explorer with embedded chat

PR #7 of the §7 roadmap. Last open issue. Closes #44 / synthesis #56.

## Decisions locked

1. **Path (C)** — agency-side `/app/chat` is a fresh OpenAI client wired into the existing Hono daemon. NOT proxied through OpenClaw. Conversational memory is **not** shared with Telegram. ENS / signing / kernel identity stays unified.
2. **Schema bump is decoupled hygiene.** `agent-schema-v1.json` declares `additionalProperties: true` and `verifyAgentIdentity` reads only the 9 keys in `AGENT_RECORD_KEYS` by name. The new `agent-endpoint[chat]` record is invisible to the verifier — synthesis reads it via a parallel `getTextRecord`.
3. **No `lib/verify.ts` wrapper.** Call `verifyAgentIdentity()` directly in `page.tsx`, mirroring `src/app/trust/page.tsx:19` (`resolve(ENS_NAME, ...)` inline).
4. **AI SDK pin: `ai@^6.0.158` + `@ai-sdk/react@^3.0.160`** — matches `agency/external/namera/apps/docs/package.json` exactly. Protocol drift between writer (agency) and reader (synthesis) is the failure mode.
5. **`force-dynamic`** on the page — live ENS reads each load, no ISR/SSG.
6. **Server component does verification + endpoint lookup → passes resolved URL as a prop to client `<ChatPanel />`.** Standard Next.js prop-drilling pattern.
7. **`Promise.all` for the parallel ENS reads.** `verifyAgentIdentity(name)` and `getTextRecord(client, name, "agent-endpoint[chat]")` share no data; running in parallel shaves ~0.5–1s off SSR.
8. **Chat-record read failure degrades gracefully to "no chat surface."** A transient RPC blip on the optional record shouldn't take down the verification panel. `try/catch` resolves to `null`.
9. **Curl smoke is the only E2E.** No Playwright introduced for one test. CI runs `curl -fsSL https://<deployed>/agent/emilemarcelagustin.eth | grep -q "TRL Identity Card"`.
10. **Tailwind v4 design-token consistency with `/trust`** is non-negotiable. Read `src/app/trust/page.tsx` + `globals.css` end-to-end before coding panels. Same `--color-ink*` tokens, same mono+sans pairing, same animation conventions.

## Two amendments applied (from issue #56 comments)

- **Drop the `--agent-endpoint-chat` flag claim.** `agent publish`'s flag set (#51) is fixed at the canonical 9. Agency-side step 7 uses `ensemble edit txt <name> "agent-endpoint[chat]" <url>` instead. No synthesis CLI change needed.
- **Drop `verify_agent(ensName)` from the v0.1 tool set.** `@synthesis/resolver` isn't on npm; importing it into the agency runtime would create cross-repo drift. Ship with `get_identity_card` + `get_policy_summary` only. Future implication: "publish `@synthesis/resolver` to npm" is the natural post-sprint follow-up; once it lands, `verify_agent` (and agent-to-agent trust resolution) come back.

## Files (~580 LOC)

| File | Status | Change |
|---|---|---|
| `packages/site/src/app/agent/[name]/page.tsx` | new (~120) | Server component, `force-dynamic`. Parallel `verifyAgentIdentity` + `getTextRecord("agent-endpoint[chat]")` via `Promise.all`. Catches no-resolver → `notFound()`. Renders both panels. Exports `generateMetadata`. |
| `packages/site/src/app/agent/[name]/IdentityPanel.tsx` | new (~150) | Server component (no `"use client"`). Identity Card + 5-layer verification grid + policy summary. Same Tailwind v4 tokens as `/trust`. |
| `packages/site/src/app/agent/[name]/ChatPanel.tsx` | new (~130) | Client component (`"use client"`). `useChat` from `@ai-sdk/react`. Receives `endpoint: string \| null` + `agentName: string`. `null` → "no chat surface" placeholder. |
| `packages/site/src/app/agent/[name]/loading.tsx` | new (~40) | Two-column skeleton with `animate-pulse`. |
| `packages/site/src/app/agent/[name]/error.tsx` | new (~30) | Error boundary; renders sanitized message + digest, never raw error. |
| `packages/site/src/app/agent/[name]/not-found.tsx` | new (~30) | "ENS name not registered" + link back to `/trust`. |
| `packages/site/package.json` | edit | Add `"ai": "^6.0.158"` + `"@ai-sdk/react": "^3.0.160"`. |
| `plans/ensemble-agent-explorer.md` | new | This doc. |

## Sequencing

1. Branch `feat/agent-explorer` off main.
2. Add deps to `packages/site/package.json`. `pnpm install`.
3. Read `src/app/trust/page.tsx` + `src/app/globals.css` end-to-end. Note design-token vocabulary, font pairing, spacing scale, animation conventions.
4. Build `IdentityPanel.tsx` against a frozen `AgentVerifyResult` fixture (use `packages/resolver/test/fixtures/agent-verify/records.json` as the basis).
5. Build `ChatPanel.tsx`. Standard message list + input. `useChat()` configured to POST to the endpoint URL prop with the body shape AI SDK 3.x expects.
6. Wire both into `page.tsx` with parallel `Promise.all` + `try/catch` on the chat-record read.
7. Add `loading.tsx`, `error.tsx`, `not-found.tsx`.
8. Local `pnpm dev` smoke test against `emilemarcelagustin.eth` + a name with no records (e.g. `vitalik.eth`).
9. Open PR. Vercel preview URL becomes the live acceptance target. Capture screenshot + transcript (chat transcript shows the placeholder if agency-side isn't deployed yet — that's still a valid v0.1 demonstration).

## Acceptance

```bash
pnpm install && pnpm -r build
pnpm --filter @synthesis/site dev
# visit http://localhost:3000/agent/emilemarcelagustin.eth
# expect: full TRL panel + chat placeholder (or working chat if agency-side is deployed)
# visit http://localhost:3000/agent/vitalik.eth
# expect: TRL panel showing missing records + "no chat surface" placeholder
```

Live URL on Vercel preview rendering both panels is the artifact for the ENS Forum post.
