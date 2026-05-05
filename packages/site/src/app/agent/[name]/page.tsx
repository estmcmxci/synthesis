import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  verifyAgentIdentity,
  getTextRecord,
  createEnsClient,
  type AgentVerifyResult,
} from "@synthesis/resolver";
import { IdentityPanel } from "./IdentityPanel";
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

  const [verifyResult, chatEndpoint] = await Promise.all<
    [Promise<AgentVerifyResult>, Promise<string | null>]
  >([
    verifyAgentIdentity(ensName, { ensRpcUrl: rpcUrl }),
    getTextRecord(client, ensName, "agent-endpoint[chat]").catch(() => null),
  ]);

  const allRecordsMissing =
    verifyResult.layers.records.missing.length === 9;

  if (verifyResult.identityCard.ownerAddress === null && allRecordsMissing) {
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

      {allRecordsMissing ? (
        <NoAgentIdentity ensName={ensName}>
          <ChatPanel endpoint={chatEndpoint} agentName={ensName} />
        </NoAgentIdentity>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <IdentityPanel result={verifyResult} />
          <ChatPanel endpoint={chatEndpoint} agentName={ensName} />
        </div>
      )}

      <div className="mt-10 pt-4 border-t border-[var(--color-border)] animate-fade-up delay-3">
        <p className="text-xs text-[var(--color-ink-muted)]">
          Resolved live against Ethereum mainnet. Chat is anonymous and not persisted across
          reloads.
        </p>
      </div>
    </div>
  );
}

function NoAgentIdentity({
  ensName,
  children,
}: {
  ensName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <section className="animate-fade-up">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)]">
          TRL Identity Card
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-ink)]">
          {ensName}
        </h2>
        <div className="mt-6 border border-[var(--color-border)] rounded-md p-6 bg-white">
          <p className="text-sm text-[var(--color-ink)] font-medium">
            No ENS-bound agent identity published.
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            This name is registered, but does not publish the ENSIP-64 agent records (
            <span className="font-mono">class</span>, <span className="font-mono">schema</span>,{" "}
            <span className="font-mono">runtime-pubkey</span>, etc.) required by the Trust
            Resolution Layer.
          </p>
          <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
            See the spec at{" "}
            <a
              href="/essay"
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline"
            >
              /essay
            </a>
            , or browse a verified agent at{" "}
            <a
              href="/trust"
              className="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] underline"
            >
              /trust
            </a>
            .
          </p>
        </div>
      </section>
      {children}
    </div>
  );
}
