"use client";

import Link from "next/link";

export default function AdminOccasionsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-8">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-red-700">
          Administration
        </p>
        <h1 className="mt-2 font-display text-2xl text-red-950">
          Occasions could not load
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-red-800">
          Something went wrong while loading occasions. Try again; if it keeps
          happening, return to administration and check the database
          connection.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-red-900 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-800"
          >
            Try again
          </button>
          <Link
            href="/admin"
            className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-900 transition-colors hover:bg-red-100"
          >
            Back to administration
          </Link>
        </div>
      </div>
    </div>
  );
}
