import { Skeleton } from "@/components/ui/skeleton";

const statKeys = ["one", "two", "three", "four"];
const rowKeys = ["one", "two", "three", "four", "five"];

export function DashboardLoading({
  label = "Loading dashboard",
  stats = 4,
  rows = 5,
}: {
  label?: string;
  stats?: number;
  rows?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="space-y-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statKeys.slice(0, Math.min(stats, statKeys.length)).map((key) => (
          <div
            key={key}
            className="rounded-2xl border border-line/70 bg-paper/70 p-5"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-28" />
            <Skeleton className="mt-4 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <div className="rounded-2xl border border-line/70 bg-paper/70 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
          <div className="mt-6 divide-y divide-line/60">
            {rowKeys.slice(0, Math.min(rows, rowKeys.length)).map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-40 max-w-full" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line/70 bg-wine p-5 sm:p-6">
          <Skeleton className="h-3 w-24" tone="light" />
          <Skeleton className="mt-3 h-5 w-40" tone="light" />
          <div className="mt-6 space-y-4">
            {rowKeys.slice(0, 3).map((key) => (
              <div key={key} className="rounded-xl bg-paper/10 p-3">
                <Skeleton className="h-3 w-24" tone="light" />
                <Skeleton className="mt-2 h-4 w-32" tone="light" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only">Loading</span>
    </div>
  );
}
