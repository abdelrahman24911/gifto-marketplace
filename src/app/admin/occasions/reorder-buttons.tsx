"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { moveOccasion } from "./actions";

export function ReorderOccasionButtons({
  occasionId,
  occasionName,
  isFirst,
  isLast,
}: {
  occasionId: string;
  occasionName: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(moveOccasion, null);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  return (
    <div className="inline-flex flex-col gap-1">
      <form
        action={formAction}
        className="inline-flex overflow-hidden rounded-full border border-line-strong bg-paper"
      >
        <input type="hidden" name="occasion_id" value={occasionId} />
        <button
          type="submit"
          name="direction"
          value="up"
          disabled={pending || isFirst}
          aria-label={`Move ${occasionName} up`}
          title={
            isFirst ? `${occasionName} is already first` : `Move up`
          }
          className="px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep disabled:cursor-not-allowed disabled:text-ink-mute/40 disabled:hover:bg-transparent"
        >
          ↑
        </button>
        <span aria-hidden className="my-1.5 w-px bg-line" />
        <button
          type="submit"
          name="direction"
          value="down"
          disabled={pending || isLast}
          aria-label={`Move ${occasionName} down`}
          title={isLast ? `${occasionName} is already last` : `Move down`}
          className="px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep disabled:cursor-not-allowed disabled:text-ink-mute/40 disabled:hover:bg-transparent"
        >
          ↓
        </button>
      </form>
      {state?.error ? (
        <span role="alert" className="max-w-40 text-xs text-red-700">
          {state.error}
        </span>
      ) : (
        <span className="sr-only" role="status">
          {state?.success ?? ""}
        </span>
      )}
    </div>
  );
}
