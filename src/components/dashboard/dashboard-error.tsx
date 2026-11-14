"use client";

import Link from "next/link";
import { useEffect } from "react";

export function DashboardError({
  error,
  reset,
  title = "This section did not load",
  description = "Something went wrong while loading your dashboard. Try again, or return to the storefront if the problem continues.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto max-w-2xl rounded-3xl border border-danger/20 bg-paper p-6 shadow-[0_24px_60px_-50px_oklch(0.25_0.085_18/0.7)] sm:p-8"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-danger">
        Something went wrong
      </p>
      <h1 className="mt-3 font-display text-3xl leading-tight text-ink">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-line-strong bg-paper px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
        >
          Back to storefront
        </Link>
      </div>
    </div>
  );
}
