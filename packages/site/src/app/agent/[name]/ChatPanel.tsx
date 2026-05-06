"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

interface ChatPanelProps {
  endpoint: string | null;
  agentName: string;
}

export function ChatPanel({ endpoint, agentName }: ChatPanelProps) {
  if (!endpoint) {
    return <NoChatSurface agentName={agentName} />;
  }
  return <ConnectedChat endpoint={endpoint} agentName={agentName} />;
}

function ConnectedChat({ endpoint, agentName }: { endpoint: string; agentName: string }) {
  void endpoint; // The endpoint URL is read server-side; the browser posts to a
  // same-origin proxy at /api/chat-proxy/[name] to avoid Pinata's CORS-preflight
  // edge handler (which strips Access-Control-Allow-Origin from OPTIONS responses).
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/chat-proxy/${encodeURIComponent(agentName)}`,
      }),
    [agentName],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isStreaming = status === "submitted" || status === "streaming";

  return (
    <section className="animate-fade-up delay-1 flex flex-col h-full">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Live Chat
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          Talk to {agentName}
        </h2>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Anonymous. Conversation is not persisted.
        </p>
      </header>

      <div className="flex-1 min-h-[420px] flex flex-col border border-[var(--color-border)] rounded-md bg-white overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-[var(--color-ink-faint)] italic">
              No messages yet — say hello.
            </p>
          )}

          {messages.map((m) => (
            <Message key={m.id} role={m.role}>
              {m.parts.map((part, i) =>
                part.type === "text" ? (
                  <span key={`${m.id}-${i}`} className="whitespace-pre-wrap">
                    {part.text}
                  </span>
                ) : null,
              )}
            </Message>
          ))}

          {error && (
            <p className="text-xs text-[var(--color-fail)] font-mono pt-2">
              error: {error.message}
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = input.trim();
            if (!trimmed || isStreaming) return;
            sendMessage({ text: trimmed });
            setInput("");
          }}
          className="border-t border-[var(--color-border)] p-3 flex gap-2 bg-[var(--color-surface-raised)]"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${agentName} something…`}
            className="flex-1 px-3 py-2 text-sm rounded-md border border-[var(--color-border)] bg-white text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-accent)]"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? "…" : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}

function Message({ role, children }: { role: string; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
          isUser
            ? "bg-[var(--color-accent)] text-white"
            : "bg-[var(--color-surface-raised)] text-[var(--color-ink)] border border-[var(--color-border)]"
        }`}
      >
        <span className="block text-[10px] font-mono uppercase tracking-widest opacity-70 mb-0.5">
          {isUser ? "you" : "agent"}
        </span>
        {children}
      </div>
    </div>
  );
}

function NoChatSurface({ agentName }: { agentName: string }) {
  return (
    <section className="animate-fade-up delay-1 flex flex-col h-full">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Live Chat
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          Talk to {agentName}
        </h2>
      </header>

      <div className="flex-1 min-h-[420px] flex items-center justify-center border border-dashed border-[var(--color-border)] rounded-md bg-white">
        <div className="px-8 py-10 text-center max-w-sm">
          <p className="text-sm text-[var(--color-ink)] font-medium">
            This agent does not expose a public chat surface.
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            No <span className="font-mono">agent-endpoint[chat]</span> ENS record is published.
            The identity panel still verifies, and the agent may be reachable through other
            surfaces.
          </p>
        </div>
      </div>
    </section>
  );
}
