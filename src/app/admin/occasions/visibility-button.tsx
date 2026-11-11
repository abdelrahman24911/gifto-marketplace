"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { setOccasionVisibility } from "./actions";

export function VisibilityButton({
  occasionId,
  occasionName,
  isActive,
}: {
  occasionId: string;
  occasionName: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    setOccasionVisibility,
    null,
  );

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="occasion_id" value={occasionId} />
      <input
        type="hidden"
        name="next_state"
        value={isActive ? "hidden" : "published"}
      />
      <button
        type="submit"
        disabled={pending}
        aria-label={
          isActive
            ? `Hide ${occasionName}`
            : `Publish ${occasionName}`
        }
        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          isActive
            ? "border-line-strong bg-paper text-ink-soft hover:border-berry/40 hover:text-berry-deep"
            : "border-berry/25 bg-berry-soft text-berry-deep hover:bg-berry-tint"
        }`}
      >
        {pending ? "Saving…" : isActive ? "Hide" : "Publish"}
      </button>
      {state?.error ? (
        <span role="alert" className="max-w-40 text-xs text-red-700">
          {state.error}
        </span>
      ) : (
        <span className="sr-only" role="status">
          {state?.success ?? ""}
        </span>
      )}
    </form>
  );
}
