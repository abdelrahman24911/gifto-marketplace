export default function VendorLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading shop dashboard…</span>
      <div className="animate-pulse">
        <div className="h-7 w-48 rounded-md bg-line" />
        <div className="mt-2 h-4 w-72 max-w-full rounded bg-line/70" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 rounded-xl border border-line bg-paper-soft"
            />
          ))}
        </div>
        <div className="mt-8 h-56 rounded-2xl border border-line bg-paper-soft" />
      </div>
    </div>
  );
}
