"use client";

import { useActionState, useRef } from "react";

import { moderateReview, type ModerateReviewState } from "./actions";

/**
 * UX Batch 2 (reviews): approve or reject one pending review. Moderation
 * is once-only, so both decisions are confirmed first.
 */
export function ModerateReviewForm({
  reviewId,
  rating,
}: {
  reviewId: string;
  rating: number;
}) {
  const [state, formAction, pending] = useActionState<
    ModerateReviewState,
    FormData
  >(moderateReview, null);
  // The clicked button sets this before submit; the confirm reads it.
  const decisionRef = useRef<boolean | null>(null);
  const succeeded = Boolean(state && "success" in state);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const approved = decisionRef.current;
        const message =
          approved === true
            ? `Approve this ${rating}-star review? It will appear publicly on the gift page.`
            : "Reject this review? It will stay hidden.";
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
      className="mt-3 flex flex-col gap-2"
    >
      <input type="hidden" name="review_id" value={reviewId} />
      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-ink"
        >
          {state.error}
        </p>
      ) : null}
      {succeeded && state && "success" in state ? (
        <p
          role="status"
          className="rounded-xl border border-success/25 bg-success-soft px-3 py-2 text-sm text-ink"
        >
          {state.success}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="approved"
          value="true"
          disabled={pending || succeeded}
          onClick={() => {
            decisionRef.current = true;
          }}
          className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Approve"}
        </button>
        <button
          type="submit"
          name="approved"
          value="false"
          disabled={pending || succeeded}
          onClick={() => {
            decisionRef.current = false;
          }}
          className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </form>
  );
}
