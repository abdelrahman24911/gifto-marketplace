"use client";

import { useActionState } from "react";

import { TAG_DESCRIPTION_MAX } from "@/lib/tagging";

import { reviewTagSuggestion, type TagReviewState } from "./actions";

export function SuggestionReview({
  suggestionId,
  name,
  description,
  vendorName,
  createdAt,
}: {
  suggestionId: string;
  name: string;
  description: string | null;
  vendorName: string | null;
  createdAt: string;
}) {
  const [state, formAction, pending] = useActionState<TagReviewState, FormData>(
    reviewTagSuggestion,
    null,
  );

  return (
    <li className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-medium text-ink">{name}</h3>
          <p className="mt-1 text-xs text-ink-mute">
            Suggested by {vendorName ?? "a vendor"} on{" "}
            {new Date(createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <span className="rounded-full border border-amber-300 bg-paper px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-900">
          Pending review
        </span>
      </div>

      {description ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {description}
        </p>
      ) : null}

      <form action={formAction} className="mt-3">
        <input type="hidden" name="suggestion_id" value={suggestionId} />
        <label className="flex flex-col gap-1 text-xs font-medium text-ink">
          Rejection reason (optional)
          <textarea
            name="rejection_reason"
            rows={2}
            maxLength={TAG_DESCRIPTION_MAX}
            placeholder="Only used when rejecting"
            className="w-full rounded-lg border border-amber-300 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
          />
        </label>

        {state?.error ? (
          <p role="alert" className="mt-2 text-sm font-medium text-red-700">
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p
            role="status"
            className="mt-2 text-sm font-medium text-emerald-800"
          >
            {state.success}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending}
            className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving..." : "Approve tag"}
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={pending}
            className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </form>
    </li>
  );
}
