"use client";

import { useActionState } from "react";

import { retryMailOutbox, type MailOutboxActionState } from "./actions";

export function MailOutboxRetryForm({ disabled = false }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<
    MailOutboxActionState,
    FormData
  >(retryMailOutbox, null);

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={disabled || pending}
        title={
          disabled
            ? "SMTP is not configured — retrying would not send anything"
            : undefined
        }
        className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Retrying…" : "Retry pending emails"}
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
