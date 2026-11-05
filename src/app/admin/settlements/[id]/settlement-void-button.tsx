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
      <label className="flex flex-col gap-1 text-sm font-medium text-emerald-950">
        Reason for voiding
        <textarea
          name="reason"
          required
          maxLength={500}
          rows={3}
          placeholder="Explain why this batch is being voided"
          className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700"
        />
      </label>
      <p className="text-xs text-emerald-800">
        Required. The reason is stored with the void and cannot be edited.
      </p>
      <button
        type="submit"
        disabled={pending || Boolean(state && "success" in state)}
        className="self-start rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Voiding settlement…" : "Void settlement"}
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
