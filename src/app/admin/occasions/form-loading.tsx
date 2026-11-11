export function OccasionFormLoading({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10"
    >
      <span className="sr-only">{label}</span>
      <div className="animate-pulse">
        <div className="h-4 w-64 max-w-full rounded bg-line/70" />
        <div className="mt-6">
          <div className="h-3 w-24 rounded bg-line/70" />
          <div className="mt-3 h-12 w-80 max-w-full rounded-lg bg-line" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-line/70" />
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-8">
            <div>
              <div className="border-b border-line pb-4">
                <div className="h-6 w-40 rounded bg-line" />
                <div className="mt-2 h-3 w-72 max-w-full rounded bg-line/70" />
              </div>
              <div className="mt-5 space-y-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index}>
                    <div className="h-3 w-20 rounded bg-line/70" />
                    <div className="mt-2 h-11 w-full rounded-lg bg-line/60" />
                  </div>
                ))}
                <div className="h-32 w-full rounded-lg bg-line/60" />
              </div>
            </div>
            <div>
              <div className="border-b border-line pb-4">
                <div className="h-6 w-36 rounded bg-line" />
                <div className="mt-2 h-3 w-80 max-w-full rounded bg-line/70" />
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div className="aspect-[4/3] rounded-xl border border-line bg-line/60" />
                <div className="space-y-5">
                  <div>
                    <div className="h-3 w-24 rounded bg-line/70" />
                    <div className="mt-2 h-11 w-full rounded-lg bg-line/60" />
                  </div>
                  <div className="h-10 w-32 rounded-full bg-line/60" />
                </div>
              </div>
            </div>
          </div>
          <div className="h-80 rounded-2xl border border-line bg-paper-soft p-5">
            <div className="h-6 w-28 rounded bg-line" />
            <div className="mt-4 h-20 rounded-xl border border-line bg-paper" />
            <div className="mt-5 h-11 rounded-lg bg-line/60" />
            <div className="mt-5 h-10 w-full rounded-full bg-line" />
            <div className="mt-3 h-9 w-full rounded-full bg-line/60" />
          </div>
        </div>
      </div>
    </div>
  );
}
