import type { TrustProfile } from "@synthesis/resolver";

export function TrustProfilePanel({ profile }: { profile: TrustProfile }) {
  return (
    <section className="animate-fade-up">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Trust Profile
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          {profile.ensName}
        </h2>
        <p className="mt-1 font-mono text-xs text-[var(--color-ink-faint)]">
          {profile.address ?? "address not resolved"}
        </p>
      </header>

      <div className="mb-6">
        <div className="inline-flex items-baseline gap-3 px-4 py-2.5 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]">
          <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
            Trust Tier
          </span>
          <span className={`text-lg font-semibold ${tierColor(profile.trustScore)}`}>
            {profile.trustScore}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-2">
          Resolution Layers
        </p>

        <LayerCard
          number={0}
          name="Personhood"
          protocol="World ID"
          passed={profile.personhood.verified}
          details={
            profile.personhood.verified
              ? [
                  { label: "Status", value: "Verified" },
                  { label: "Nullifier", value: profile.personhood.nullifierHash ?? "", mono: true },
                  { label: "Network", value: profile.personhood.network ?? "" },
                ]
              : [{ label: "Status", value: "Not registered in AgentBook" }]
          }
        />

        <LayerCard
          number={1}
          name="Identity"
          protocol="ENSIP-25"
          passed={profile.identity.verified}
          details={
            profile.identity.verified
              ? [
                  { label: "Agent ID", value: `#${profile.identity.agentId}` },
                  { label: "Registry", value: profile.identity.registryAddress ?? "", mono: true },
                  { label: "Chain", value: profile.identity.registryChain ?? "" },
                  { label: "Owner", value: profile.identity.owner ?? "", mono: true },
                ]
              : [{ label: "Status", value: "No ENSIP-25 agent-registration record found" }]
          }
        />

        <LayerCard
          number={2}
          name="Context"
          protocol="ENSIP-26"
          passed={profile.context.found}
          details={
            profile.context.found
              ? [
                  { label: "Raw", value: profile.context.raw ?? "" },
                  ...(profile.context.skillUrl
                    ? [{ label: "SKILL.md", value: profile.context.skillUrl }]
                    : []),
                ]
              : [{ label: "Status", value: "No agent-context text record set" }]
          }
        />

        <LayerCard
          number={3}
          name="Manifest"
          protocol="AIP"
          passed={profile.manifest.found && profile.manifest.signatureValid}
          details={
            profile.manifest.found
              ? [
                  { label: "Version", value: profile.manifest.latestVersion ?? "" },
                  { label: "Mode", value: profile.manifest.lineageMode ?? "" },
                  {
                    label: "Signature",
                    value: profile.manifest.signatureValid ? "Valid" : "INVALID",
                  },
                  { label: "Lineage depth", value: String(profile.manifest.lineageDepth) },
                  {
                    label: "Lineage intact",
                    value: profile.manifest.lineageIntact ? "Yes" : "No",
                  },
                ]
              : [{ label: "Status", value: "No AIP records (agent-latest, agent-version-lineage)" }]
          }
        />

        <LayerCard
          number={4}
          name="Skill"
          protocol="DVS"
          passed={profile.skill.found && profile.skill.domainVerified}
          details={
            profile.skill.found
              ? [
                  { label: "URL", value: profile.skill.url ?? "" },
                  {
                    label: "Domain verified",
                    value: profile.skill.domainVerified ? "Yes" : "No",
                  },
                  { label: "Size", value: `${profile.skill.content?.length ?? 0} bytes` },
                ]
              : [{ label: "Status", value: "No SKILL.md found (no skill URL in agent-context)" }]
          }
        />
      </div>

      <p className="mt-4 font-mono text-[10px] text-[var(--color-ink-faint)]">
        Resolved at {new Date(profile.resolvedAt).toISOString()}
      </p>
    </section>
  );
}

function LayerCard({
  number,
  name,
  protocol,
  passed,
  details,
}: {
  number: number;
  name: string;
  protocol: string;
  passed: boolean;
  details: { label: string; value: string; mono?: boolean }[];
}) {
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 bg-white">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 text-sm ${
            passed ? "text-[var(--color-pass)]" : "text-[var(--color-fail)]"
          }`}
        >
          {passed ? "✓" : "✗"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">{number}</span>
            <span
              className={`text-sm font-medium ${
                passed ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"
              }`}
            >
              {name}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">{protocol}</span>
          </div>
          <div className="mt-2 space-y-1">
            {details.map(({ label, value, mono }, i) => (
              <div key={`${label}-${i}`} className="flex gap-2 text-xs">
                <span className="text-[var(--color-ink-muted)] shrink-0 w-24">{label}</span>
                <span
                  className={`text-[var(--color-ink)] truncate ${mono ? "font-mono text-[10px] pt-px" : ""}`}
                  title={value}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function tierColor(tier: string): string {
  switch (tier) {
    case "full":
      return "text-[var(--color-pass)]";
    case "verified":
      return "text-cyan-600";
    case "discoverable":
      return "text-yellow-600";
    case "registered":
      return "text-purple-600";
    default:
      return "text-[var(--color-fail)]";
  }
}
