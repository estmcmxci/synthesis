import Link from "next/link";

export default function AgentExplorerNotFound() {
  return (
    <div className="px-8 md:px-16 py-16 md:py-24 max-w-2xl">
      <header className="mb-6 animate-fade-up">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Trust Resolution Layer
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Agent not found
        </h1>
      </header>

      <div className="border border-[var(--color-border)] rounded-md p-6 bg-white animate-fade-up delay-1">
        <p className="text-sm text-[var(--color-ink)]">
          This ENS name is not registered, or has no resolver set.
        </p>
        <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
          Browse a verified agent at{" "}
          <Link
            href="/trust"
            className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline"
          >
            /trust
          </Link>
          , or read about the Trust Resolution Layer in{" "}
          <Link
            href="/essay"
            className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline"
          >
            the essay
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
