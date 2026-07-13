# Plan: emilemarcelagustin Telegram bot — full MM CLI access

Tracks: #68. Depends on: #66 (done — Railway + mm migration, Telegram bridge
initial ship, live 2026-07-13).

## Goal

Extend the `emilemarcelagustin.eth` Telegram bridge from its current
read-only identity persona to wallet parity with steg/carlos's Telegram
agent: balance reads, transfers, swaps, ENS record edits, callable
conversationally through the bot.

## Current state (as of 2026-07-13)

`~/webdev/agency/deploy/ens-agent/runtime/` (not in this repo):

- `src/persona.ts` — shared system prompt + `buildReadOnlyTools()`:
  `get_identity_card`, `get_policy_summary` only. Used by both `src/chat.ts`
  (public web chat) and `src/telegram.ts` (bridge).
- `src/telegram.ts` — adds one extra tool on top of the shared read-only
  set: `request_signature`, which only *stages* a request; the actual
  signing happens in a callback handler on the operator's "Sign" tap in the
  Telegram UI (exact-bytes card, re-verifies tapper ID, 5-min TTL, one
  pending per chat, refuses pure-hex + >10k messages).
- Access control: `TELEGRAM_ALLOWED_USER_IDS` (may chat, fail-closed
  allowlist) vs `TELEGRAM_OPERATOR_USER_IDS` (may trigger `request_signature`
  staging). Currently both set to the same single ID (2132218140).

## Reference implementation

`~/metamask-telegram` — steg-ens-agent's Brain, merged `feat/telegram-bridge`
→ `main` (commit `f1c7915ba3cb9e506b017e5a87446bbd37b202f5`,
`estmcmxci/steg-ens-agent#2`). Reuses the full `ens_agent` tool set
unchanged (61 tools — reads, transfers, swaps, x402, ENS management)
inside the Telegram flow. Gate bypass pattern: `gate.py`'s `telegram_mode`
ContextVar short-circuits `gate_or_refusal()` for Telegram-triggered
actions — the Telegram allowlist becomes the sole access control on that
path, deliberately, not the on-chain ENS authority gate. Verified in
production via real Telegram messages: wallet reads, an executed
$1 USDC↔ETH swap, a real x402 payment.

## Design decision to make before writing code

**Should the expanded toolset be available to `TELEGRAM_ALLOWED_USER_IDS`
generally, or gated to `TELEGRAM_OPERATOR_USER_IDS` only?**

This wallet is more than a demo wallet — it anchors this agent's on-chain
identity records (ENS `agent-endpoint`, ERC-8004 registration #36581).
Leaning toward gating wallet-action tools (transfer/swap/ENS-edit) to
operators only, and keeping balance/read tools open to the full allowlist,
unless there's a specific reason to widen further. Confirm with the user
before implementing — this is a real trust-model choice, not a detail.

## Sketch

1. Add a `buildWalletTools(config)` alongside the existing
   `buildReadOnlyTools(config)` in `persona.ts` (or a new module) — balance,
   transfer, swap, ENS-edit, mirroring steg's tool surface but scoped to
   what `mm` actually supports (transaction-based ops only — see the
   `personal_sign` limitation below, which rules nothing out here since
   none of these are message-signing).
2. Wire the new tools into `src/telegram.ts` only (not `src/chat.ts` — web
   chat stays read-only forever, per existing design intent), gated per the
   decision above.
3. Match steg's confirmation-before-execute UX (see the carlos.steg.eth
   swap example: bot proposes a preview, requires an explicit "Yes" before
   submitting).
4. Smoke test via real Telegram DMs before calling it done: a balance read,
   a small swap, an ENS record read — mirroring how #66's Telegram launch
   was verified.

## Explicitly out of scope

- Fixing `/sign` / `request_signature`'s completion step — that's blocked
  on an upstream MetaMask limitation (`mm` doesn't support `personal_sign`
  on agent wallets yet), tracked as a separate product decision on #66, not
  something this issue can unblock.
- Any change to the public web chat's read-only boundary.
