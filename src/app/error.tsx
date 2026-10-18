"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Container } from "@/components/ui/section";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
        Something went wrong
      </p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
        We hit a snag
      </h1>
      <p className="mt-4 max-w-md text-ink-soft">
        An unexpected error stopped this page from loading. Try again, or head
        back to safety.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-12 items-center rounded-full bg-berry px-6 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:border-berry/40 hover:text-berry"
        >
          Back home
        </Link>
      </div>
    </Container>
  );
}
