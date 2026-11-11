export default function AdminOccasionsLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10"
    >
      <span className="sr-only">Loading occasions…</span>
      <div className="animate-pulse">
        <div className="h-4 w-52 rounded bg-line/70" />
        <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="h-3 w-28 rounded bg-line/70" />
            <div className="mt-3 h-12 w-64 max-w-full rounded-lg bg-line" />
            <div className="mt-3 h-4 w-80 max-w-full rounded bg-line/70" />
          </div>
          <div className="h-10 w-36 rounded-full bg-line" />
        </div>
        <div className="mt-6 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="px-5 py-4">
              <div className="h-3 w-16 rounded bg-line/70" />
              <div className="mt-2 h-7 w-10 rounded bg-line" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <div className="h-8 w-20 rounded-full bg-line" />
          <div className="h-8 w-24 rounded-full bg-line/70" />
          <div className="h-8 w-20 rounded-full bg-line/70" />
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex gap-5 rounded-2xl border border-line bg-paper-soft p-5"
            >
              <div className="h-28 w-28 shrink-0 rounded-xl bg-line/70" />
              <div className="min-w-0 flex-1">
                <div className="h-5 w-1/3 min-w-32 rounded bg-line" />
                <div className="mt-2 h-3 w-1/2 rounded bg-line/70" />
                <div className="mt-4 h-4 w-3/4 rounded bg-line/70" />
                <div className="mt-2 h-4 w-1/2 rounded bg-line/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
