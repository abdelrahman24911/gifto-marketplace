"use client";

import { useActionState } from "react";

import { formatEgp } from "@/lib/money";

import {
  recordDirectRepayment,
  type DirectRepaymentState,
} from "./actions";

const inputClass =
  "w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass =
  "flex flex-col gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-mute";

/**
 * R-02 (D-08, N-01): record a vendor's direct repayment of an
 * outstanding paid-return clawback. The repayment happened outside the
 * dashboard (usually a bank transfer); the reference is the proof. This
 * resolves the clawback, so it is confirmed first — it cannot be undone
 * and the clawback will never be netted against a future settlement.
 */
export function ClawbackRepaymentForm({
  clawbackId,
  remainingMinor,
}: {
  clawbackId: string;
  remainingMinor: number;
}) {
  const [state, formAction, pending] =
    useActionState<DirectRepaymentState, FormData>(
      recordDirectRepayment,
      null,
    );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Confirm the shop repaid ${formatEgp(remainingMinor)} directly to Gifto. This resolves the clawback and cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      className="mt-3 flex flex-col gap-3"
    >
      <input type="hidden" name="clawback_id" value={clawbackId} />
      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-ink"
        >
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
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className={labelClass}>
          Repayment reference
          <input
            type="text"
            name="reference"
            required
            minLength={3}
            maxLength={200}
            placeholder="e.g. Bank receipt 123456"
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={pending || Boolean(state && "success" in state)}
          className="rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record direct repayment"}
        </button>
      </div>
    </form>
  );
}
