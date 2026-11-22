import Link from "next/link";

import { totalPages } from "@/lib/pagination";

/**
 * Server-rendered Previous/Next links. `buildHref` receives a page number and
 * returns the full URL so each list keeps its own filters (vendor, status).
 */
export function Pagination({
  page,
  total,
  pageSize,
  buildHref,
  label = "Pagination",
}: {
  page: number;
  total: number;
  pageSize: number;
  buildHref: (page: number) => string;
  label?: string;
}) {
  const pages = totalPages(total, pageSize);
  if (pages <= 1) return null;

  const linkClass =
    "rounded-full border border-line-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-paper-deep";
  const disabledClass =
    "rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink-mute/60";

  return (
    <nav
      aria-label={label}
      className="mt-6 flex flex-wrap items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Link href={buildHref(page - 1)} rel="prev" className={linkClass}>
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Previous
        </span>
      )}
      <p className="min-w-0 flex-1 text-center text-sm text-ink-soft">
        Page {page} of {pages} · {total} total
      </p>
      {page < pages ? (
        <Link href={buildHref(page + 1)} rel="next" className={linkClass}>
          Next
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          Next
        </span>
      )}
    </nav>
  );
}
