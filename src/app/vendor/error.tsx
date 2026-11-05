"use client";

import Link from "next/link";

export default function VendorError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-8">
      <h1 className="font-display text-xl text-red-950">
        The shop dashboard could not load
      </h1>
      <p className="mt-2 text-sm text-red-800">
        Something went wrong while loading this page. Try again, or return to
        your account if the problem continues.
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
          href="/account"
          className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-900 transition-colors hover:bg-red-100"
        >
          Go to account
        </Link>
      </div>
    </div>
  );
}
