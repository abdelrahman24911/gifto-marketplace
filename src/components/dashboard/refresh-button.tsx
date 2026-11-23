"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A working "Try again" for dashboard load-error states. Several admin and
 * vendor pages used to say "Refresh the page" with no control at all; this
 * re-runs the server render (router.refresh) and shows a pending state
 * while the new data loads.
 */
export function RefreshButton({
  label = "Try again",
  className = "mt-2 inline-flex rounded-full border border-line-strong bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-60",
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className={className}
    >
      {pending ? "Loading…" : label}
    </button>
  );
}
