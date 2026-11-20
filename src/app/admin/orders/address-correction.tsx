"use client";

import { useActionState } from "react";

import {
  ADDRESS_CORRECTION_REASONS,
  GOVERNORATE_NAMES,
  type AddressCorrectionValues,
} from "@/lib/order-address";

import {
  correctAdminOrderAddress,
  type AdminAddressCorrectionState,
} from "./actions";

const inputClass =
  "rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink";
const labelClass = "flex flex-col gap-1 text-sm text-ink";
const primaryClass =
  "rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Delivery-address correction for the admin order detail page (P1-13,
 * H-10). Shows current values, requires a reason (and a note when the
 * reason is "other"), and surfaces the coverage warning from the RPC as a
 * second confirmation naming the affected shops before anything changes.
 */
export function AdminAddressCorrection({
  orderId,
  current,
  canCorrect,
}: {
  orderId: string;
  current: AddressCorrectionValues;
  canCorrect: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    AdminAddressCorrectionState,
    FormData
  >(correctAdminOrderAddress, null);

  if (!canCorrect) {
    return (
      <p className="mt-3 text-xs text-ink-mute">
        The address can no longer be corrected — a shop line on this order
        has already been delivered or returned.
      </p>
    );
  }

  const values =
    state && "values" in state && state.values ? state.values : current;
  const coverageWarning =
    state && "coverageWarning" in state ? state.coverageWarning : null;

  return (
    <details className="mt-3 rounded-xl border border-line bg-paper px-3 py-2">
      <summary className="cursor-pointer list-none text-sm font-medium text-berry hover:text-berry-deep">
        Correct address
      </summary>

      <form action={formAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="order_id" value={orderId} />
        <label className={labelClass}>
          <span className="font-medium">Recipient name</span>
          <input
            name="recipient_name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={values.recipientName}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">Phone</span>
          <input
            name="contact_phone"
            required
            minLength={5}
            maxLength={30}
            defaultValue={values.contactPhone}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">Address</span>
          <input
            name="address_line"
            required
            minLength={5}
            maxLength={300}
            defaultValue={values.addressLine}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">City</span>
          <input
            name="city"
            required
            minLength={2}
            maxLength={80}
            defaultValue={values.city}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="font-medium">Governorate</span>
          <select
            name="governorate"
            required
            defaultValue={values.governorate}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a governorate
            </option>
            {GOVERNORATE_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className="font-medium">Reason</span>
          <select
            name="reason_code"
            required
            defaultValue={values.reasonCode}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {Object.entries(ADDRESS_CORRECTION_REASONS).map(
              ([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ),
            )}
          </select>
        </label>
        <label className={labelClass}>
          <span className="font-medium">
            Note{" "}
            <span className="font-normal text-ink-mute">
              (required when the reason is other)
            </span>
          </span>
          <textarea
            name="note"
            rows={2}
            maxLength={1000}
            defaultValue={values.note}
            className={inputClass}
          />
        </label>

        {coverageWarning ? (
          <div
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <p className="font-medium">
              This address is outside the delivery area of{" "}
              {coverageWarning.join(", ")}.
            </p>
            <p className="mt-1">
              Saving will leave {coverageWarning.length === 1 ? "that shop" : "those shops"} unable
              to deliver to the new address. Confirm only if the shop has
              agreed to deliver anyway.
            </p>
            <label className="mt-2 flex items-start gap-2 font-medium">
              <input
                type="checkbox"
                name="acknowledge_coverage_break"
                className="mt-0.5"
              />
              <span>
                I understand — save this address even though{" "}
                {coverageWarning.join(", ")} does not cover it.
              </span>
            </label>
          </div>
        ) : null}

        <button type="submit" disabled={pending} className={`${primaryClass} self-start`}>
          {pending
            ? "Saving…"
            : coverageWarning
              ? "Confirm correction anyway"
              : "Save corrected address"}
        </button>
      </form>

      {state && "error" in state ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
    </details>
  );
}
