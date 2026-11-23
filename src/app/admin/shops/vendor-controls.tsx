"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";

import { ConfirmSubmit } from "@/components/dashboard/confirm-submit";

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

  // Controlled inputs so the confirm step can state the exact change
  // ("Active → Suspended", "10% → 12%") before anything is submitted.
  const [statusValue, setStatusValue] = useState<VendorStatus>(vendor.status);
  const [rateInput, setRateInput] = useState(String(currentPercent));
  // The rate input submits on Enter, so its confirm step is a form-level
  // gate rather than a button: the first submit (click or Enter) shows the
  // summary, the second one acts.
  const [rateConfirming, setRateConfirming] = useState(false);
  const rateWasPending = useRef(false);
  useEffect(() => {
    if (rateWasPending.current && !ratePending) setRateConfirming(false);
    rateWasPending.current = ratePending;
  }, [ratePending]);

  const statusLabel = (value: VendorStatus) =>
    STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;

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
            value={statusValue}
            onChange={(event) =>
              setStatusValue(event.target.value as VendorStatus)
            }
            className={inputClass}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ConfirmSubmit
            label="Apply"
            pendingLabel="Saving…"
            pending={statusPending}
            disabled={statusValue === vendor.status}
            summary={`Change ${vendor.name} from ${statusLabel(vendor.status)} to ${statusLabel(statusValue)}?`}
            className={buttonClass}
          />
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

      <form
        action={rateAction}
        onSubmit={(event) => {
          if (!rateConfirming) {
            event.preventDefault();
            setRateConfirming(true);
          }
        }}
        className="flex flex-col gap-2"
      >
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
              value={rateInput}
              onChange={(event) => setRateInput(event.target.value)}
              className={`${inputClass} w-28 pr-7`}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-mute"
            >
              %
            </span>
          </div>
          <button
            type="submit"
            disabled={ratePending || rateInput === String(currentPercent)}
            className={buttonClass}
          >
            {ratePending
              ? "Saving…"
              : rateConfirming
                ? "Confirm"
                : "Save rate"}
          </button>
          {rateConfirming ? (
            <button
              type="button"
              onClick={() => setRateConfirming(false)}
              disabled={ratePending}
              className={buttonClass}
            >
              Cancel
            </button>
          ) : null}
        </div>
        {rateConfirming ? (
          <p role="alert" className="text-xs font-medium leading-relaxed text-ink">
            Change {vendor.name} commission from {currentPercent}% to{" "}
            {rateInput || "—"}%? Applies to future orders only.
          </p>
        ) : null}
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
