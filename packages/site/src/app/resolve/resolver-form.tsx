"use client";

import { useState, useTransition } from "react";
import type { TrustProfile } from "@synthesis/resolver";
import { resolveENSName } from "./actions";

export function ResolverForm() {
  const [name, setName] = useState("emilemarcelagustin.eth");
  const [profile, setProfile] = useState<TrustProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setProfile(null);

    startTransition(async () => {
      const result = await resolveENSName(name);
      if (result.error) {
        setError(result.error);
      } else {
        setProfile(result.profile);
      }
    });
  }

  return (
    <div>
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="ens-name"
            className="block text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-1.5"
          >
            ENS Name
          </label>
          <input
            id="ens-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="vitalik.eth"
            className="w-full px-3 py-2 text-sm bg-white border border-[var(--color-border)] rounded-md text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-md hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Resolving..." : "Resolve"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="mt-6 p-3 text-sm text-[var(--color-fail)] bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {/* Results */}
      {profile && (
        <div className="mt-8 space-y-6">
          {/* Header */}
          <div className="pb-4 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              {profile.ensName}
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">
              {profile.address ?? "address not resolved"}
            </p>
          </div>

          {/* Layers */}
          <div className="space-y-3">
            <LayerRow
              label="Personhood"
              protocol="World ID"
              passed={profile.personhood.verified}
              detail={
                profile.personhood.verified
                  ? `nullifier: ${profile.personhood.nullifierHash?.slice(0, 14)}...`
                  : "not registered in AgentBook"
              }
            />
            <LayerRow
              label="Identity"
              protocol="ENSIP-25"
              passed={profile.identity.verified}
              detail={
                profile.identity.verified
                  ? `ERC-8004 #${profile.identity.agentId}, ${profile.identity.registryChain}`
                  : "no agent-registration record"
              }
            />
            <LayerRow
              label="Context"
              protocol="ENSIP-26"
              passed={profile.context.found}
              detail={
                profile.context.found
                  ? profile.context.skillUrl
                    ? `SKILL.md: ${profile.context.skillUrl}`
                    : "agent-context present"
                  : "no agent-context record"
              }
            />
            <LayerRow
              label="Manifest"
              protocol="AIP"
              passed={profile.manifest.found && profile.manifest.signatureValid}
              detail={
                profile.manifest.found
                  ? profile.manifest.signatureValid
                    ? `${profile.manifest.latestVersion}, signature valid, lineage: ${profile.manifest.lineageDepth}`
                    : `${profile.manifest.latestVersion}, signature INVALID`
                  : "no AIP records"
              }
            />
            <LayerRow
              label="Skill"
              protocol="DVS"
              passed={profile.skill.found && profile.skill.domainVerified}
              detail={
                profile.skill.found
                  ? profile.skill.domainVerified
                    ? `domain-verified: ${profile.skill.url}`
                    : `found but domain not verified`
                  : "no SKILL.md"
              }
            />
          </div>

          {/* Trust Tier */}
          <div className="pt-4 border-t border-[var(--color-border)]">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
                Trust Tier
              </span>
              <span
                className={`text-sm font-semibold ${getTierColor(profile.trustScore)}`}
              >
                {profile.trustScore}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
              resolved at {new Date(profile.resolvedAt).toISOString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerRow({
  label,
  protocol,
  passed,
  detail,
}: {
  label: string;
  protocol: string;
  passed: boolean;
  detail: string;
}) {
  return (
    <div className="flex gap-3 items-start">
      <span className={`mt-0.5 text-sm ${passed ? "text-[var(--color-pass)]" : "text-[var(--color-fail)]"}`}>
        {passed ? "✓" : "✗"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-sm ${passed ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}`}
          >
            {label}
          </span>
          <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
            {protocol}
          </span>
        </div>
        <p className="text-xs text-[var(--color-ink-muted)] mt-0.5 truncate">
          {detail}
        </p>
      </div>
    </div>
  );
}

function getTierColor(tier: string): string {
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
