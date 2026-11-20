"use client";

import { useActionState, useId } from "react";

import { formatEgp } from "@/lib/money";

import {
  resolveRefundCase,
  type ResolveRefundState,
} from "./actions";

export function ResolveRefundForm({
  caseId,
  suggestedMinor,
}: {
  caseId: string;
  suggestedMinor: number;
}) {
  const [state, formAction, pending] = useActionState<
    ResolveRefundState,
    FormData
  >(resolveRefundCase, null);
  const id = useId();
  const suggested = (suggestedMinor / 100).toFixed(2);

  return (
    <details className="mt-4 rounded-xl border border-line-strong bg-paper p-4">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Resolve this case
      </summary>
      <form action={formAction} className="mt-3 grid gap-3">
        <input type="hidden" name="case_id" value={caseId} />

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <label
              htmlFor={`${id}-amount`}
              className="block text-xs font-semibold uppercase tracking-wide text-ink-mute"
            >
              Refund amount (EGP)
            </label>
            <input
              id={`${id}-amount`}
              name="refund_amount"
              inputMode="decimal"
              defaultValue={suggested}
              className="mt-1 w-full rounded-lg border border-line-strong bg-paper-soft px-3 py-2 text-sm text-ink"
            />
            <p className="mt-1 text-xs text-ink-mute">
              Suggested {formatEgp(suggestedMinor)}. Required to approve.
            </p>
          </div>
          <div>
            <label
              htmlFor={`${id}-note`}
              className="block text-xs font-semibold uppercase tracking-wide text-ink-mute"
            >
              Note to customer (optional)
            </label>
            <input
              id={`${id}-note`}
              name="note"
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-line-strong bg-paper-soft px-3 py-2 text-sm text-ink"
              placeholder="How the refund will be handled"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending}
            className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving." : "Approve refund"}
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={pending}
            className="rounded-full border border-danger/30 bg-paper px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject
          </button>
        </div>

        {state && "error" in state ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        {state && "success" in state ? (
          <p role="status" className="text-sm text-success">
            {state.success}
          </p>
        ) : null}
      </form>
    </details>
  );
}
