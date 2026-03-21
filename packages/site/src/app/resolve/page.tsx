import type { Metadata } from "next";
import { ResolverForm } from "./resolver-form";

export const metadata: Metadata = {
  title: "Resolve — Trust Resolution Layer",
  description:
    "Type any ENS name and resolve it through all 5 trust layers in real time.",
};

export default function ResolvePage() {
  return (
    <div className="px-8 md:px-16 py-16 md:py-24 max-w-2xl">
      <header className="mb-8 animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Resolve
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Type any ENS name to resolve it through all 5 trust layers.
        </p>
      </header>

      <div className="animate-fade-up delay-1">
        <ResolverForm />
      </div>
    </div>
  );
}
