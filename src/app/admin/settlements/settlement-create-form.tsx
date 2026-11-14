"use client";

import { useActionState } from "react";

import { formatEgp } from "@/lib/money";

import { createSettlement, type CreateSettlementState } from "./actions";

type VendorOption = {
  id: string;
  name: string;
  totals: {
    count: number;
    grossMinor: number;
    commissionMinor: number;
    netMinor: number;
  };
};

const inputClass =
  "w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass =
  "flex flex-col gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-mute";

export function CreateSettlementForm({
  vendors,
}: {
  vendors: VendorOption[];
}) {
  const [state, formAction, pending] =
    useActionState<CreateSettlementState, FormData>(createSettlement, null);

  if (vendors.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong bg-paper px-4 py-6 text-center text-sm text-ink-soft">
        No delivered commission is ready to settle. Commission becomes
        available after a shop suborder is delivered.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <label className={labelClass}>
          Shop
          <select name="vendor_id" required className={inputClass}>
            <option value="">Choose a shop</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name} — {formatEgp(vendor.totals.commissionMinor)}{" "}
                commission on {formatEgp(vendor.totals.grossMinor)} gross (
                {formatEgp(vendor.totals.netMinor)} shop net,{" "}
                {vendor.totals.count}{" "}
                {vendor.totals.count === 1 ? "suborder" : "suborders"})
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Note (optional)
          <input
            type="text"
            name="note"
            maxLength={500}
            placeholder="e.g. Cash payout handed to owner"
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs leading-relaxed text-ink-mute">
          Opening a batch locks the available commission into a settlement.
          Check the shop and amount before continuing. A mistaken batch can be
          voided with a required reason before it is marked paid.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Opening…" : "Open settlement"}
        </button>
      </div>
    </form>
  );
}
