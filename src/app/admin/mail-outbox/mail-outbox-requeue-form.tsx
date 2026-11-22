"use client";

import { useActionState } from "react";

import {
  requeueMailOutboxRow,
  type MailOutboxActionState,
} from "./actions";

/**
 * Requeues one terminally failed outbox row (S-06). Requeueing burns
 * no attempt — it moves the row back to pending with a fresh attempt
 * count so it can be retried once SMTP is configured.
 *
 * S-10: requeues are capped per row. At the cap the button is replaced
 * by a note — the server action refuses it too, so this is display
 * only, not the enforcement. The counts arrive as plain numbers from
 * the server page: this client form must not import the server-only
 * mail module for the cap constant.
 */
export function MailOutboxRequeueForm({
  rowId,
  requeueCount,
  maxRequeues,
}: {
  rowId: string;
  requeueCount: number;
  maxRequeues: number;
}) {
  const [state, formAction, pending] = useActionState<
    MailOutboxActionState,
    FormData
  >(requeueMailOutboxRow, null);

  if (requeueCount >= maxRequeues) {
    return (
      <p className="mt-2 text-xs text-ink-mute">
        Requeue limit reached — this email has already been requeued{" "}
        {maxRequeues} times and stays failed.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="row_id" value={rowId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Requeueing…" : "Requeue for retry"}
      </button>
      {state && "error" in state && state.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state && state.success ? (
        <p role="status" className="mt-2 text-sm text-success">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
