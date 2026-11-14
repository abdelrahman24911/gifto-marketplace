"use client";

import { useActionState } from "react";

import { setCommissionRate, setVendorStatus } from "../actions";

import type { VendorStatus } from "@/lib/supabase/database.types";

type Vendor = {
  id: string;
  name: string;
  status: VendorStatus;
  commission_rate: number;
};

const inputClass =
  "rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm text-ink focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const buttonClass =
  "rounded-full border border-line-strong bg-paper px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_OPTIONS: { value: VendorStatus; label: string }[] = [
  { value: "pending", label: "Pending review" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

export function VendorControls({ vendor }: { vendor: Vendor }) {
  const [statusState, statusAction, statusPending] = useActionState(
    setVendorStatus,
    null,
  );
  const [rateState, rateAction, ratePending] = useActionState(
    setCommissionRate,
    null,
  );

  const statusMessage =
    statusState?.vendorId === vendor.id ? statusState : null;
  const rateMessage = rateState?.vendorId === vendor.id ? rateState : null;
  const currentPercent = Number(vendor.commission_rate) * 100;

  return (
    <div className="grid gap-4 border-t border-line/70 pt-4 sm:grid-cols-2">
      <form action={statusAction} className="flex flex-col gap-2">
        <input type="hidden" name="vendor_id" value={vendor.id} />
        <label
          className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute"
          htmlFor={`status-${vendor.id}`}
        >
          Shop access
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id={`status-${vendor.id}`}
            name="status"
            defaultValue={vendor.status}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={statusPending}
            className={buttonClass}
          >
            {statusPending ? "Saving…" : "Apply"}
          </button>
        </div>
        {statusMessage?.error ? (
          <span role="alert" className="text-xs text-danger">
            {statusMessage.error}
          </span>
        ) : statusMessage?.success ? (
          <span role="status" className="text-xs text-success">
            {statusMessage.success}
          </span>
        ) : null}
      </form>

      <form action={rateAction} className="flex flex-col gap-2">
        <input type="hidden" name="vendor_id" value={vendor.id} />
        <label
          className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute"
          htmlFor={`rate-${vendor.id}`}
        >
          Commission rate
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              id={`rate-${vendor.id}`}
              name="commission_percent"
              type="number"
              min={0}
              max={100}
              step={0.01}
              defaultValue={currentPercent}
              className={`${inputClass} w-28 pr-7`}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-mute"
            >
              %
            </span>
          </div>
          <button type="submit" disabled={ratePending} className={buttonClass}>
            {ratePending ? "Saving…" : "Save rate"}
          </button>
        </div>
        <p className="text-[0.68rem] leading-relaxed text-ink-mute">
          Applies to future orders only.
        </p>
        {rateMessage?.error ? (
          <span role="alert" className="text-xs text-danger">
            {rateMessage.error}
          </span>
        ) : rateMessage?.success ? (
          <span role="status" className="text-xs text-success">
            {rateMessage.success}
          </span>
        ) : null}
      </form>
    </div>
  );
}
