"use client";

import { useActionState } from "react";

import { voidSettlement, type VoidSettlementState } from "../actions";

export function SettlementVoidButton({
  settlementId,
}: {
  settlementId: string;
}) {
  const [state, formAction, pending] =
    useActionState<VoidSettlementState, FormData>(voidSettlement, null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Void this open settlement? Its lines and reason stay in the audit history, and the commission becomes available to settle again.",
          )
        ) {
          event.preventDefault();
        }
      }}
      className="flex max-w-xl flex-col gap-2"
    >
      <input type="hidden" name="settlement_id" value={settlementId} />
      <label className="flex flex-col gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-mute">
        Reason for voiding
        <textarea
          name="reason"
          required
          maxLength={500}
          rows={3}
          placeholder="Explain why this batch is being voided"
          className="rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
        />
      </label>
      <p className="text-xs text-ink-soft">
        Required. The reason is stored with the void and cannot be edited.
      </p>
      <button
        type="submit"
        disabled={pending || Boolean(state && "success" in state)}
        className="self-start rounded-full border border-danger/30 bg-paper px-4 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Voiding settlement…" : "Void settlement"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : state && "success" in state ? (
        <p
          role="status"
          className="rounded-xl border border-success/25 bg-success-soft px-3 py-2 text-sm text-ink"
        >
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
