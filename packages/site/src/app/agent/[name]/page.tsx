import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  resolve,
  verifyAgentIdentity,
  getTextRecord,
  createEnsClient,
  type AgentVerifyResult,
  type TrustProfile,
} from "@synthesis/resolver";
import { TrustProfilePanel } from "./TrustProfilePanel";
import { VerificationPanel } from "./VerificationPanel";
import { ChatPanel } from "./ChatPanel";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { name } = await params;
  const ensName = decodeURIComponent(name);
  return {
    title: `Agent: ${ensName}`,
    description: `${ensName} — verified via the Trust Resolution Layer`,
  };
}

export default async function AgentExplorerPage({ params }: PageProps) {
  const { name } = await params;
  const ensName = decodeURIComponent(name);

  console.log("[agent-explorer] resolving", ensName);
  console.log(
    "[agent-explorer] ETH_RPC_URL:",
    process.env.ETH_RPC_URL ? "set" : "NOT SET",
  );

  const rpcUrl = process.env.ETH_RPC_URL;
  const client = createEnsClient(rpcUrl);

  const [trustProfile, verifyResult, chatEndpoint] = await Promise.all([
    resolve(ensName, { ensRpcUrl: rpcUrl }).catch((err) => {
      console.error("[agent-explorer] resolve failed:", err);
      return null;
    }),
    verifyAgentIdentity(ensName, { ensRpcUrl: rpcUrl }),
    getTextRecord(client, ensName, "agent-endpoint[chat]").catch(() => null),
  ]);

  const allRecordsMissing = verifyResult.layers.records.missing.length === 9;

  if (
    verifyResult.identityCard.ownerAddress === null &&
    allRecordsMissing &&
    !trustProfile?.address
  ) {
    notFound();
  }

  return (
    <div className="px-8 md:px-16 py-16 md:py-24 max-w-5xl">
      <header className="mb-10 animate-fade-up">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Trust Resolution Layer
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          Agent Explorer
        </h1>
        <p className="mt-2 font-mono text-sm text-[var(--color-ink-muted)]">{ensName}</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {trustProfile ? (
          <TrustProfilePanel profile={trustProfile} />
        ) : (
          <TrustProfileFallback ensName={ensName} />
        )}
        <ChatPanel endpoint={chatEndpoint} agentName={ensName} />
      </div>

      <div className="mt-12">
        {allRecordsMissing ? (
          <NoEnsip64Records ensName={ensName} />
        ) : (
          <VerificationPanel result={verifyResult satisfies AgentVerifyResult} />
        )}
      </div>

      <div className="mt-10 pt-4 border-t border-[var(--color-border)] animate-fade-up delay-3">
        <p className="text-xs text-[var(--color-ink-muted)]">
          Resolved live against Ethereum mainnet and Base. Chat is anonymous and not persisted
          across reloads.
        </p>
      </div>
    </div>
  );
}

function TrustProfileFallback({ ensName }: { ensName: string }) {
  return (
    <section className="animate-fade-up">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Trust Profile
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          {ensName}
        </h2>
      </header>
      <div className="border border-[var(--color-border)] rounded-md p-6 bg-white">
        <p className="text-sm text-[var(--color-ink)]">
          Could not resolve a trust profile for this name.
        </p>
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          The conceptual TRL layers (Personhood, Identity, Context, Manifest, Skill) require ENS
          + AgentBook + Base RPC reads, one of which failed. The ENSIP-64 record verification
          below may still render if the records are present.
        </p>
      </div>
    </section>
  );
}

function NoEnsip64Records({ ensName }: { ensName: string }) {
  void ensName;
  return (
    <section className="animate-fade-up delay-2">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          Deep Verification
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          ENSIP-64 Record Authenticity
        </h2>
      </header>
      <div className="border border-[var(--color-border)] rounded-md p-6 bg-white">
        <p className="text-sm text-[var(--color-ink)] font-medium">
          No ENSIP-64 agent records published.
        </p>
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          This name does not publish the 9 ENSIP-64 records (
          <span className="font-mono">class</span>, <span className="font-mono">schema</span>,{" "}
          <span className="font-mono">runtime-pubkey</span>, <span className="font-mono">runtime-status</span>
          , <span className="font-mono">kernel-wallet</span>,{" "}
          <span className="font-mono">agent-endpoint[web]</span>,{" "}
          <span className="font-mono">delegation</span>, <span className="font-mono">policy-hash</span>,{" "}
          <span className="font-mono">policy-version</span>) required by the deep-verification
          layer. The trust profile above tells the broader story; the absence of records here is
          why Context (Layer 2) is failing.
        </p>
      </div>
    </section>
  );
}
