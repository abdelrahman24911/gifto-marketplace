"use client";

import { useActionState } from "react";

import {
  markSettlementPaid,
  type SettlementPaidState,
} from "../actions";
import {
  TRANSFER_METHOD_LABELS,
  TRANSFER_METHODS,
} from "@/lib/finance";
import { minorToEgpInput } from "@/lib/money";

/**
 * P1-05 (D-08): recording a settlement paid attests that Gifto received
 * the commission from the shop. The amount is pre-filled with the derived
 * net commission due and stays editable so a wrong amount can be entered
 * and rejected; the transfer method and the vendor's transfer reference
 * are required. Nothing here moves money — the transfer happened outside
 * the dashboard.
 *
 * N-01 (D-08): when the net commission due is zero, the batch was fully
 * offset by paid-return clawbacks — no transfer took place, so the form
 * collects no proof at all and records the batch paid with amount 0.
 */
export function SettlementPaidForm({
  settlementId,
  commissionDueMinor,
}: {
  settlementId: string;
  commissionDueMinor: number;
}) {
  const [state, formAction, pending] =
    useActionState<SettlementPaidState, FormData>(markSettlementPaid, null);

  if (commissionDueMinor === 0) {
    return (
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Confirm this batch was fully offset by paid-return clawbacks, so no commission was due and no transfer took place. This records the settlement as paid and cannot be undone.",
            )
          ) {
            event.preventDefault();
          }
        }}
        className="mt-3 flex flex-col gap-3"
      >
        <input type="hidden" name="settlement_id" value={settlementId} />
        <input type="hidden" name="paid_amount" value="0" />
        <p className="text-sm text-ink-soft">
          No commission is due — paid-return clawbacks fully offset this
          batch. No transfer took place, so there is no method or reference
          to record.
        </p>
        <button
          type="submit"
          disabled={pending || Boolean(state && "success" in state)}
          className="self-start rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record batch as paid (no transfer)"}
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

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const form = new FormData(event.currentTarget);
        const amount = String(form.get("paid_amount") ?? "").trim();
        const reference = String(form.get("transfer_reference") ?? "").trim();
        if (
          !window.confirm(
            `Confirm Gifto received ${amount || "an amount"} from the shop, reference ${reference || "not given"}. This records the settlement as paid and cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      className="mt-3 flex flex-col gap-3"
    >
      <input type="hidden" name="settlement_id" value={settlementId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Amount Gifto received (EGP)</span>
          <input
            name="paid_amount"
            type="text"
            inputMode="decimal"
            required
            defaultValue={minorToEgpInput(commissionDueMinor)}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink"
          />
          <span className="text-xs text-ink-mute">
            Pre-filled with the net commission due. A different amount is
            rejected — the record must match the commission due exactly.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Transfer method</span>
          <select
            name="transfer_method"
            defaultValue="bank_transfer"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink"
          >
            {TRANSFER_METHODS.map((method) => (
              <option key={method} value={method}>
                {TRANSFER_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Transfer reference</span>
          <input
            name="transfer_reference"
            type="text"
            required
            minLength={3}
            maxLength={200}
            placeholder="e.g. bank receipt number"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink"
          />
          <span className="text-xs text-ink-mute">
            The vendor&apos;s bank transfer reference. Required — it is the
            proof of this payment.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">
            Proof note <span className="text-ink-mute">(optional)</span>
          </span>
          <input
            name="proof_note"
            type="text"
            maxLength={500}
            placeholder="e.g. receipt filed under 2026-11-15"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-ink"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || Boolean(state && "success" in state)}
        className="self-start rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Recording receipt…" : "Record commission received"}
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
