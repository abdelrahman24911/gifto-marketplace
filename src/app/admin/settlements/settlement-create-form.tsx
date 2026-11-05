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
  "rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

export function CreateSettlementForm({
  vendors,
}: {
  vendors: VendorOption[];
}) {
  const [state, formAction, pending] =
    useActionState<CreateSettlementState, FormData>(createSettlement, null);

  if (vendors.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
        No delivered commission is ready to settle. Commission becomes
        available after a shop suborder is delivered.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

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
          placeholder="e.g. Cash payout handed to shop owner"
          className={inputClass}
        />
      </label>

      <p className="text-xs text-zinc-500">
        Opening a batch locks the available commission into a settlement. Check
        the shop and amount before continuing. A mistaken batch can be voided
        with a required reason before it is marked paid.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Opening…" : "Open settlement"}
      </button>
    </form>
  );
}
