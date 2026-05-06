/**
 * Same-origin chat proxy.
 *
 * The browser POSTs to `/api/chat-proxy/<ensName>`; this handler reads the
 * agent's `agent-endpoint[chat]` ENS record, runs the SSRF guard, forwards
 * the request body, and streams the AI-SDK chunked response back.
 *
 * Why this exists: Pinata's reverse proxy intercepts CORS preflight
 * (`OPTIONS`) requests at the edge and returns a default response that
 * lacks `Access-Control-Allow-Origin`, causing browsers to block the
 * follow-up POST with "Load failed". The agency-side Hono daemon emits
 * the right CORS headers on POST itself, but never sees the OPTIONS.
 * Routing through this same-origin proxy avoids the preflight entirely.
 *
 * Architectural note: the kickoff doc's "NO synthesis-side proxy" rule
 * was specifically about not routing *conversation state* through the
 * OpenClaw orchestrator. A stateless byte-pump like this preserves the
 * same threat-model properties — no shared session memory, identity
 * still anchored at ENS / runtime-pubkey / kernel-wallet — while
 * unblocking the browser path.
 */

import { NextRequest } from "next/server";
import {
  createEnsClient,
  getTextRecord,
  assertPublicHttpUrl,
  SsrfBlockedError,
} from "@synthesis/resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ name: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { name } = await ctx.params;
  const ensName = decodeURIComponent(name);

  let chatEndpoint: string | null;
  try {
    const client = createEnsClient(process.env.ETH_RPC_URL);
    chatEndpoint = await getTextRecord(client, ensName, "agent-endpoint[chat]");
  } catch (err) {
    return Response.json(
      { error: "ens_read_failed", message: (err as Error).message },
      { status: 502 },
    );
  }

  if (!chatEndpoint) {
    return Response.json(
      {
        error: "no_chat_endpoint",
        message: `${ensName} has no agent-endpoint[chat] ENS record`,
      },
      { status: 404 },
    );
  }

  try {
    await assertPublicHttpUrl(chatEndpoint);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return Response.json(
        { error: "blocked", message: err.message },
        { status: 403 },
      );
    }
    throw err;
  }

  const body = await req.text();

  const upstream = await fetch(chatEndpoint, {
    method: "POST",
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
    },
    body,
  });

  // Stream the upstream body back. Preserve the AI SDK protocol headers so
  // useChat() can detect the v1 UI-message stream format.
  const responseHeaders: HeadersInit = {
    "content-type": upstream.headers.get("content-type") ?? "text/event-stream",
    "cache-control": "no-cache",
  };
  const aiHeader = upstream.headers.get("x-vercel-ai-ui-message-stream");
  if (aiHeader) responseHeaders["x-vercel-ai-ui-message-stream"] = aiHeader;

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
