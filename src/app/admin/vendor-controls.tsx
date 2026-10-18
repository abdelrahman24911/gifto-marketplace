"use client";

import { useActionState } from "react";

import { setCommissionRate, setVendorStatus } from "./actions";

import type { VendorStatus } from "@/lib/supabase/database.types";

type Vendor = {
  id: string;
  name: string;
  status: VendorStatus;
  commission_rate: number;
  city: string | null;
  governorate: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

const inputClass =
  "rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const buttonClass =
  "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_OPTIONS: VendorStatus[] = [
  "pending",
  "active",
  "suspended",
  "rejected",
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
    <div className="flex flex-col gap-3 border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-900">{vendor.name}</p>
          <p className="text-sm text-zinc-500">
            {[vendor.city, vendor.governorate].filter(Boolean).join(", ") ||
              "Location not set"}
            {vendor.contact_email ? ` · ${vendor.contact_email}` : ""}
            {vendor.contact_phone ? ` · ${vendor.contact_phone}` : ""}
          </p>
        </div>
        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
          {vendor.status}
        </span>
      </div>

      <form action={statusAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="vendor_id" value={vendor.id} />
        <label className="text-sm text-zinc-600" htmlFor={`status-${vendor.id}`}>
          Status
        </label>
        <select
          id={`status-${vendor.id}`}
          name="status"
          defaultValue={vendor.status}
          className={inputClass}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" disabled={statusPending} className={buttonClass}>
          {statusPending ? "Saving…" : "Apply"}
        </button>
        {statusMessage?.error ? (
          <span role="alert" className="text-sm text-red-600">
            {statusMessage.error}
          </span>
        ) : statusMessage?.success ? (
          <span role="status" className="text-sm text-emerald-700">
            {statusMessage.success}
          </span>
        ) : null}
      </form>

      <form
        action={rateAction}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="vendor_id" value={vendor.id} />
        <label
          className="text-sm text-zinc-600"
          htmlFor={`rate-${vendor.id}`}
        >
          Commission %
        </label>
        <input
          id={`rate-${vendor.id}`}
          name="commission_percent"
          type="number"
          min={0}
          max={100}
          step={0.01}
          defaultValue={currentPercent}
          className={`${inputClass} w-24`}
        />
        <button type="submit" disabled={ratePending} className={buttonClass}>
          {ratePending ? "Saving…" : "Save"}
        </button>
        {rateMessage?.error ? (
          <span role="alert" className="text-sm text-red-600">
            {rateMessage.error}
          </span>
        ) : rateMessage?.success ? (
          <span role="status" className="text-sm text-emerald-700">
            {rateMessage.success}
          </span>
        ) : null}
      </form>
    </div>
  );
}
