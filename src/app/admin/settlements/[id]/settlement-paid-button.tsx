"use client";

import { useActionState } from "react";

import {
  markSettlementPaid,
  type SettlementPaidState,
} from "../actions";

export function SettlementPaidButton({
  settlementId,
}: {
  settlementId: string;
}) {
  const [state, formAction, pending] =
    useActionState<SettlementPaidState, FormData>(markSettlementPaid, null);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Confirm the external payout is complete. This records the settlement as paid and cannot be undone.",
          )
        ) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="settlement_id" value={settlementId} />
      <button
        type="submit"
        disabled={pending || Boolean(state && "success" in state)}
        className="self-start rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Recording payout…" : "Mark settlement paid"}
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
