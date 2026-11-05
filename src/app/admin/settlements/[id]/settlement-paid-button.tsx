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
        className="self-start rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Recording payout…" : "Mark settlement paid"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : state && "success" in state ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
