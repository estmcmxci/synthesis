export default function AgentExplorerLoading() {
  return (
    <div className="px-8 md:px-16 py-16 md:py-24 max-w-5xl">
      <header className="mb-10">
        <div className="h-3 w-40 bg-[var(--color-surface-raised)] rounded animate-pulse" />
        <div className="mt-3 h-7 w-56 bg-[var(--color-surface-raised)] rounded animate-pulse" />
        <div className="mt-3 h-4 w-72 bg-[var(--color-surface-raised)] rounded animate-pulse" />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <SkeletonColumn />
        <SkeletonColumn tall />
      </div>
    </div>
  );
}

function SkeletonColumn({ tall }: { tall?: boolean }) {
  return (
    <section className="space-y-3">
      <div className="h-3 w-32 bg-[var(--color-surface-raised)] rounded animate-pulse" />
      <div className="h-6 w-44 bg-[var(--color-surface-raised)] rounded animate-pulse" />
      <div
        className={`mt-4 ${tall ? "h-[460px]" : "h-[180px]"} w-full border border-[var(--color-border)] rounded-md bg-white animate-pulse`}
      />
      {!tall && (
        <>
          <div className="h-[120px] w-full border border-[var(--color-border)] rounded-md bg-white animate-pulse" />
          <div className="h-[120px] w-full border border-[var(--color-border)] rounded-md bg-white animate-pulse" />
        </>
      )}
    </section>
  );
}
