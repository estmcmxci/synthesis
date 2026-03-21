import Link from "next/link";

const LAYERS = [
  { number: 0, name: "Personhood", protocol: "World ID", description: "Biometric proof that a unique human exists behind this identity" },
  { number: 1, name: "Identity", protocol: "ENSIP-25", description: "On-chain agent registration linked to an ENS name" },
  { number: 2, name: "Discovery", protocol: "ENSIP-26", description: "Machine-readable context — endpoints, capabilities, SKILL.md" },
  { number: 3, name: "Integrity", protocol: "AIP", description: "Signed, versioned manifest with cryptographic lineage" },
  { number: 4, name: "Capability", protocol: "DVS", description: "Domain-verified skill file proving what the agent can do" },
] as const;

export default function Home() {
  return (
    <div className="px-8 md:px-16 py-16 md:py-24 max-w-2xl">
      {/* Thesis */}
      <section className="animate-fade-up">
        <p className="text-lg leading-relaxed text-[var(--color-ink)]">
          <em>The Abstracted Self</em> diagnosed algorithmic legibility as the
          loss of interiority — the self dissolved into performativity under the
          algorithmic gaze.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-[var(--color-ink)]">
          This site is the inversion: deliberate, conscious, architected
          legibility. Not a retreat from visibility, but a submission to it — on
          your own terms.
        </p>
      </section>

      {/* Divider */}
      <div className="mt-12 mb-12 h-px bg-[var(--color-border)] animate-fade-up delay-1" />

      {/* The Stack */}
      <section className="animate-fade-up delay-2">
        <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-6">
          Trust Resolution Layer
        </h2>
        <p className="text-sm text-[var(--color-ink-muted)] mb-8 leading-relaxed">
          Resolve any ENS name through five verification layers. Each layer
          builds on the one below. The result is a progressive trust score —
          from anonymous to fully legible.
        </p>

        <div className="space-y-4">
          {LAYERS.map((layer) => (
            <div
              key={layer.number}
              className="group flex gap-4 items-start"
            >
              <span className="font-mono text-xs text-[var(--color-ink-faint)] pt-0.5 w-4 shrink-0">
                {layer.number}
              </span>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-[var(--color-ink)]">
                    {layer.name}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                    {layer.protocol}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-ink-muted)] mt-0.5">
                  {layer.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="mt-12 mb-12 h-px bg-[var(--color-border)] animate-fade-up delay-3" />

      {/* Links */}
      <section className="animate-fade-up delay-4">
        <div className="flex flex-col gap-4">
          <Link
            href="/essay"
            className="group flex items-baseline justify-between border-b border-[var(--color-border)] pb-3 transition-colors hover:border-[var(--color-accent)]"
          >
            <div>
              <span className="text-sm font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                Read the essay
              </span>
              <span className="block text-xs text-[var(--color-ink-muted)] mt-0.5">
                "The Abstracted Self" — the intellectual foundation
              </span>
            </div>
            <span className="text-[var(--color-ink-faint)] group-hover:text-[var(--color-accent)] transition-colors">
              &rarr;
            </span>
          </Link>

          <Link
            href="/trust"
            className="group flex items-baseline justify-between border-b border-[var(--color-border)] pb-3 transition-colors hover:border-[var(--color-accent)]"
          >
            <div>
              <span className="text-sm font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                View trust profile
              </span>
              <span className="block text-xs text-[var(--color-ink-muted)] mt-0.5">
                Live resolution of emilemarcelagustin.eth
              </span>
            </div>
            <span className="text-[var(--color-ink-faint)] group-hover:text-[var(--color-accent)] transition-colors">
              &rarr;
            </span>
          </Link>

          <Link
            href="/resolve"
            className="group flex items-baseline justify-between border-b border-[var(--color-border)] pb-3 transition-colors hover:border-[var(--color-accent)]"
          >
            <div>
              <span className="text-sm font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                Resolve any name
              </span>
              <span className="block text-xs text-[var(--color-ink-muted)] mt-0.5">
                Interactive TRL demo — type any ENS name
              </span>
            </div>
            <span className="text-[var(--color-ink-faint)] group-hover:text-[var(--color-accent)] transition-colors">
              &rarr;
            </span>
          </Link>
        </div>
      </section>

      {/* Bottom flourish */}
      <div className="mt-16 animate-fade-up delay-5">
        <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed">
          The site that argues legibility hollows out the self is itself the
          most legible artifact on the internet. The content is the critique;
          the container is the inversion. Both are true simultaneously.
        </p>
      </div>
    </div>
  );
}
