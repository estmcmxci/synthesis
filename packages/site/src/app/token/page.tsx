import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "$ESTMCMXCI — Identity Token",
  description:
    "A profile coin backed by verified identity. Deployed through the Trust Resolution Layer as proof the entire stack is operational.",
};

export default function TokenPage() {
  return (
    <div className="px-8 md:px-16 py-16 md:py-24 max-w-2xl">
      {/* Header */}
      <header className="mb-8 animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          $ESTMCMXCI
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Identity token — the financialization of a verified self
        </p>
      </header>

      {/* Status Banner */}
      <div className="mb-8 px-4 py-3 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)] animate-fade-up delay-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-sm font-medium text-[var(--color-ink)]">
            Pending Launch
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Token deploys when all 5 trust layers pass. See{" "}
          <Link href="/trust" className="text-[var(--color-accent)] hover:underline">
            trust profile
          </Link>{" "}
          for current status.
        </p>
      </div>

      {/* Token Details */}
      <div className="space-y-6 animate-fade-up delay-2">
        <section>
          <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-4">
            Token Details
          </h2>
          <div className="border border-[var(--color-border)] rounded-md bg-white divide-y divide-[var(--color-border)]">
            <DetailRow label="Name" value="ESTMCMXCI" />
            <DetailRow label="Standard" value="ERC-20" />
            <DetailRow label="Chain" value="Base" />
            <DetailRow label="Supply" value="100,000,000,000 (fixed)" />
            <DetailRow label="Factory" value="Clanker" />
            <DetailRow label="Pool" value="Uniswap V4 (WETH pair)" />
            <DetailRow label="Swap Fee" value="1.2%" />
            <DetailRow label="Creator Reward" value="80% of fees" />
            <DetailRow label="Contract" value="—" mono placeholder />
          </div>
        </section>

        <section>
          <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-4">
            Market
          </h2>
          <div className="border border-[var(--color-border)] rounded-md bg-white divide-y divide-[var(--color-border)]">
            <DetailRow label="Price" value="—" placeholder />
            <DetailRow label="Market Cap" value="—" placeholder />
            <DetailRow label="Liquidity" value="—" placeholder />
            <DetailRow label="Fee Earnings" value="—" placeholder />
          </div>
        </section>

        {/* The Ceremony */}
        <section className="animate-fade-up delay-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-4">
            The Launch Ceremony
          </h2>
          <div className="text-sm text-[var(--color-ink)] space-y-3 leading-relaxed">
            <p>
              $ESTMCMXCI is not a platform — it&rsquo;s the financialization of a
              single verified identity. The token <em>cannot exist</em> unless
              everything underneath it is live and passing: personhood, identity,
              context, manifest, skill, site, hosting.
            </p>
            <p>
              A single CLI command that can only succeed when every layer is
              operational:
            </p>
            <pre className="mt-3 p-3 bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-md font-mono text-xs text-[var(--color-ink-muted)] overflow-x-auto">
{`ensemble launch emilemarcelagustin.eth

  1. Resolve TRL → require trustScore === "full"
  2. Verify site is live → contenthash + gateway 200
  3. Verify caller owns the ENS name
  4. Deploy via Bankr → Clanker on Base
  5. Write token address to ENS text record`}
            </pre>
            <p className="text-xs text-[var(--color-ink-muted)] italic">
              The ceremony is irreversible. The token&rsquo;s existence is proof
              that at the moment of deployment, every layer was verified.
            </p>
          </div>
        </section>

        {/* Links */}
        <section className="animate-fade-up delay-4">
          <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-4">
            Links
          </h2>
          <div className="flex flex-col gap-2">
            <ExternalLink label="Trade on Uniswap" href="#" disabled />
            <ExternalLink label="View on BaseScan" href="#" disabled />
            <ExternalLink label="View on 8004scan" href="https://8004.app/agent/24994" />
            <Link
              href="/trust"
              className="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] hover:underline transition-colors"
            >
              Trust profile &rarr;
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  mono?: boolean;
  placeholder?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline px-4 py-2.5">
      <span className="text-xs text-[var(--color-ink-muted)]">{label}</span>
      <span
        className={`text-sm ${placeholder ? "text-[var(--color-ink-faint)]" : "text-[var(--color-ink)]"} ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function ExternalLink({
  label,
  href,
  disabled,
}: {
  label: string;
  href: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="text-sm text-[var(--color-ink-faint)] cursor-not-allowed">
        {label} <span className="text-[10px]">(after launch)</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] hover:underline transition-colors"
    >
      {label} &nearr;
    </a>
  );
}
