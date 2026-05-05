import type { AgentVerifyResult } from "@synthesis/resolver";

export function VerificationPanel({ result }: { result: AgentVerifyResult }) {
  const { identityCard, layers, policy, ensName, verified } = result;

  return (
    <section className="animate-fade-up delay-2">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Deep Verification
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          ENSIP-64 Record Authenticity
        </h2>
        <p className="mt-2 max-w-2xl text-xs text-[var(--color-ink-muted)]">
          Distinct from the trust profile above. The trust profile asks{" "}
          <em>does this name represent a real, registered, signed, capable agent</em>. This panel
          asks <em>are this agent&apos;s ENSIP-64 records cryptographically authentic</em> —
          well-formed, schema-valid, hash-matching, internally consistent, and live. Mirrors the
          output of <span className="font-mono">ensemble agent verify</span>.
        </p>
        <div className="mt-3 inline-flex items-baseline gap-2 px-3 py-1 rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]">
          <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
            Verification
          </span>
          <span
            className={`text-sm font-semibold ${
              verified ? "text-[var(--color-pass)]" : "text-[var(--color-fail)]"
            }`}
          >
            {verified ? "✓ all 5 checks" : "✗ incomplete"}
          </span>
        </div>
      </header>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-2">
          Identity Card
        </p>
        <KVCard
          rows={[
            { label: "ENS name", value: ensName, mono: true },
            ...(identityCard.agentId
              ? [{ label: "Agent ID", value: `#${identityCard.agentId}` }]
              : []),
            ...(identityCard.registryChain
              ? [{ label: "Registry chain", value: identityCard.registryChain, mono: true }]
              : []),
            ...(identityCard.registryAddress
              ? [{ label: "Registry", value: identityCard.registryAddress, mono: true }]
              : []),
            { label: "Owner", value: identityCard.ownerAddress ?? "—", mono: true },
            { label: "Kernel wallet", value: identityCard.kernelWallet ?? "—", mono: true },
            { label: "Runtime pubkey", value: identityCard.runtimePubkey ?? "—", mono: true },
            { label: "Endpoint (web)", value: identityCard.endpointWeb ?? "—" },
          ]}
        />
      </div>

      <div className="mt-6 space-y-1">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-2">
          ENSIP-64 Checks
        </p>

        <LayerCard
          number={1}
          name="Records"
          protocol="ENSIP-64"
          passed={layers.records.passed}
          details={
            layers.records.passed
              ? [{ label: "Status", value: "All 9 records present and well-formed" }]
              : layers.records.missing.length > 0
                ? [
                    { label: "Status", value: "Missing records" },
                    {
                      label: "Missing",
                      value: layers.records.missing.join(", "),
                      mono: true,
                    },
                  ]
                : [
                    { label: "Status", value: "Malformed records" },
                    {
                      label: "Issues",
                      value: layers.records.malformed
                        .map((m) => `${m.key}: ${m.reason}`)
                        .join("; "),
                    },
                  ]
          }
        />

        <LayerCard
          number={2}
          name="Schema"
          protocol="agent-schema-v1"
          passed={layers.schema.passed}
          details={
            layers.schema.schemaUri
              ? layers.schema.passed
                ? [
                    { label: "Status", value: "Validates against schema" },
                    { label: "Schema URI", value: layers.schema.schemaUri, mono: true },
                  ]
                : [
                    { label: "Status", value: "Schema validation failed" },
                    { label: "Schema URI", value: layers.schema.schemaUri, mono: true },
                    ...(layers.schema.errors.length > 0
                      ? [
                          {
                            label: "Errors",
                            value: layers.schema.errors
                              .slice(0, 3)
                              .map((e) => e.message)
                              .join("; "),
                          },
                        ]
                      : []),
                  ]
              : [{ label: "Status", value: "Skipped — records layer failed" }]
          }
        />

        <LayerCard
          number={3}
          name="Integrity"
          protocol="JCS keccak256"
          passed={layers.integrity.passed}
          details={
            layers.integrity.expected
              ? [
                  { label: "Status", value: layers.integrity.passed ? "Hash matches" : "Hash mismatch" },
                  { label: "Expected", value: layers.integrity.expected, mono: true },
                  { label: "Computed", value: layers.integrity.computed ?? "—", mono: true },
                  ...(layers.integrity.policyGateway
                    ? [{ label: "Gateway", value: layers.integrity.policyGateway }]
                    : []),
                ]
              : [{ label: "Status", value: "Skipped — earlier layer failed" }]
          }
        />

        <LayerCard
          number={4}
          name="Binding"
          protocol="policy ↔ records"
          passed={layers.binding.passed}
          details={
            layers.binding.details.length > 0
              ? layers.binding.details.map((d, i) => ({
                  label: i === 0 ? "Status" : "",
                  value: d,
                }))
              : [{ label: "Status", value: "Skipped — no policy doc" }]
          }
        />

        <LayerCard
          number={5}
          name="Liveness"
          protocol="HTTP /health"
          passed={layers.liveness.passed}
          details={[
            {
              label: "Status",
              value:
                layers.liveness.responseStatus === null
                  ? "No response"
                  : layers.liveness.passed
                    ? `HTTP ${layers.liveness.responseStatus}`
                    : `Failed — HTTP ${layers.liveness.responseStatus ?? "—"}`,
            },
            ...(identityCard.endpointWeb
              ? [{ label: "Endpoint", value: `${identityCard.endpointWeb.replace(/\/$/, "")}/health` }]
              : []),
          ]}
        />
      </div>

      {(policy.scope || policy.permittedClasses || policy.prohibited) && (
        <div className="mt-6 space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-2">
            Policy
          </p>
          <KVCard
            rows={[
              ...(policy.version ? [{ label: "Version", value: policy.version, mono: true }] : []),
              ...(policy.uri ? [{ label: "URI", value: policy.uri, mono: true }] : []),
              ...(policy.scope
                ? [{ label: "Scope", value: policy.scope.join(", ") || "—" }]
                : []),
              ...(policy.permittedClasses
                ? [{ label: "Permitted", value: policy.permittedClasses.join(", ") || "—" }]
                : []),
              ...(policy.prohibited
                ? [{ label: "Prohibited", value: policy.prohibited.join(", ") || "—" }]
                : []),
            ]}
          />
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="mt-4 text-[10px] font-mono text-[var(--color-ink-faint)]">
          {result.warnings.map((w, i) => (
            <p key={i}>warning: {w}</p>
          ))}
        </div>
      )}
    </section>
  );
}

function KVCard({ rows }: { rows: { label: string; value: string; mono?: boolean }[] }) {
  return (
    <div className="border border-[var(--color-border)] rounded-md p-4 bg-white">
      <div className="space-y-1">
        {rows.map(({ label, value, mono }, i) => (
          <div key={`${label}-${i}`} className="flex gap-2 text-xs">
            <span className="text-[var(--color-ink-muted)] shrink-0 w-28">{label}</span>
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
