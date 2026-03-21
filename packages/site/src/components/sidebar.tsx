"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/essay", label: "essay" },
  { href: "/trust", label: "trust" },
  { href: "/resolve", label: "resolve" },
  { href: "/token", label: "token" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-sidebar)] px-8 py-10">
        <div>
          {/* Identity */}
          <Link href="/" className="block group">
            <h1 className="text-lg font-semibold tracking-tight text-[var(--color-ink)] leading-snug">
              émile marcel
              <br />
              agustín
            </h1>
            <p className="mt-2 font-mono text-xs text-[var(--color-ink-muted)] group-hover:text-[var(--color-accent)] transition-colors">
              emilemarcelagustin.eth
            </p>
          </Link>

          {/* Divider */}
          <div className="mt-8 mb-6 h-px bg-[var(--color-border)]" />

          {/* Navigation */}
          <nav className="flex flex-col gap-1.5">
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`nav-link pl-0 py-1.5 text-sm transition-colors ${
                  pathname === href
                    ? "text-[var(--color-ink)] font-medium"
                    : "text-[var(--color-ink-muted)]"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Footer */}
        <div className="text-xs text-[var(--color-ink-faint)]">
          <p>Trust Resolution Layer</p>
          <p className="mt-0.5">Synthesis, 2026</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-50 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-5 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-[var(--color-ink)]">
            émile marcel agustín
          </span>
          <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
            .eth
          </span>
        </Link>
        <nav className="flex gap-4">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-xs transition-colors ${
                pathname === href
                  ? "text-[var(--color-ink)] font-medium"
                  : "text-[var(--color-ink-muted)]"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
