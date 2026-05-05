"use client";

export default function AgentExplorerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-8 md:px-16 py-16 md:py-24 max-w-2xl">
      <header className="mb-6 animate-fade-up">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Trust Resolution Layer
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Could not resolve this agent
        </h1>
      </header>

      <div className="border border-[var(--color-border)] rounded-md p-6 bg-white animate-fade-up delay-1">
        <p className="text-sm text-[var(--color-ink)]">
          Something went wrong while reading ENS records or running verification. The error has
          been logged.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] text-[var(--color-ink-faint)]">
            digest: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-5 px-4 py-2 text-sm font-medium rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
