import type { AdminSeriesPoint } from "@/lib/admin-metrics";

type SeriesPoint = Pick<AdminSeriesPoint, "key" | "label" | "value">;

export function BarChart({
  points,
  formatValue,
  ariaLabel,
  emptyLabel,
  tone = "berry",
}: {
  points: readonly SeriesPoint[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  emptyLabel: string;
  tone?: "berry" | "gold" | "wine";
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const hasData = points.some((point) => point.value > 0);
  const labelStep = Math.max(1, Math.ceil(points.length / 8));

  if (!hasData) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-8 text-center text-sm text-ink-soft">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="overflow-x-auto pb-1">
        <div
          role="list"
          aria-label={ariaLabel}
          className="flex h-44 min-w-full items-end gap-1.5"
          style={{ minWidth: `${Math.max(points.length * 16, 120)}px` }}
        >
          {points.map((point, index) => {
            const height =
              point.value > 0
                ? Math.max(3, Math.round((point.value / max) * 100))
                : 0;
            const showLabel =
              index % labelStep === 0 || index === points.length - 1;

            return (
              <div
                key={point.key}
                role="listitem"
                title={`${point.label}: ${formatValue(point.value)}`}
                className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="sr-only">
                  {point.label}: {formatValue(point.value)}
                </span>
                <div aria-hidden className="flex h-32 w-full items-end">
                  <div
                    className={`w-full rounded-t transition-colors ${
                      tone === "gold"
                        ? "bg-gold/80 group-hover:bg-gold"
                        : tone === "wine"
                          ? "bg-wine/80 group-hover:bg-wine"
                          : "bg-berry/75 group-hover:bg-berry"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span
                  aria-hidden
                  className="min-h-4 whitespace-nowrap text-[10px] leading-tight text-ink-mute"
                >
                  {showLabel ? point.label : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
