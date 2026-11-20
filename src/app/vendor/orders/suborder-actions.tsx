"use client";

import { useActionState } from "react";

import {
  ORDER_STATUS_REASON_LABELS,
  VENDOR_FAILED_DELIVERY_REASONS,
} from "@/lib/order-status-reasons";
import { VENDOR_NEXT_STATUSES, type OrderStatus } from "@/lib/orders";

import { setSuborderStatus, type SuborderState } from "./actions";

const primaryClass =
  "rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60";
const secondaryClass =
  "rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-60";
const dangerClass =
  "rounded-full border border-red-300 bg-paper px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";

function optionClass(value: OrderStatus) {
  if (value === "cancelled") return dangerClass;
  if (value === "delivered") return primaryClass;
  return secondaryClass;
}

export function SuborderActions({
  suborderId,
  vendorId,
  status,
}: {
  suborderId: string;
  vendorId: string;
  status: OrderStatus;
}) {
  const [state, formAction, pending] = useActionState<SuborderState, FormData>(
    setSuborderStatus,
    null,
  );

  const options = VENDOR_NEXT_STATUSES[status] ?? [];
  const failedDelivery =
    status === "shipped"
      ? options.find((option) => option.value === "cancelled")
      : undefined;
  // P1-15: shipping records the handover (courier + tracking reference),
  // so it gets a form of its own instead of a bare button.
  const shipOption =
    status === "confirmed"
      ? options.find((option) => option.value === "shipped")
      : undefined;
  const simpleOptions = options.filter(
    (option) =>
      option.value !== "cancelled" && option.value !== "shipped",
  );

  if (options.length === 0) {
    return (
      <p className="text-sm text-ink-mute">
        No further action - this order line is closed.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
          Move this line
        </p>

        <div className="flex flex-wrap items-start gap-2">
          {simpleOptions.length > 0 ? (
            <form action={formAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="suborder_id" value={suborderId} />
              <input type="hidden" name="vendor" value={vendorId} />
              <input type="hidden" name="expected_status" value={status} />
              {simpleOptions.map((option) => (
                <button
                  key={option.value}
                  type="submit"
                  name="status"
                  value={option.value}
                  disabled={pending}
                  onClick={(event) => {
                    if (option.confirm && !window.confirm(option.confirm)) {
                      event.preventDefault();
                    }
                  }}
                  className={optionClass(option.value)}
                >
                  {pending ? "Saving." : option.label}
                </button>
              ))}
            </form>
          ) : null}

          {shipOption ? (
            <details className="rounded-2xl border border-line bg-paper px-3 py-2">
              <summary
                className={`${secondaryClass} inline-flex cursor-pointer list-none`}
              >
                {shipOption.label}
              </summary>
              <form action={formAction} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="suborder_id" value={suborderId} />
                <input type="hidden" name="vendor" value={vendorId} />
                <input type="hidden" name="expected_status" value={status} />
                <input type="hidden" name="status" value="shipped" />
                <p className="text-sm text-ink-soft">
                  Record who takes the parcel and under what reference. The
                  customer and the Gifto team see the same details.
                </p>
                <label className="flex flex-col gap-1 text-sm text-ink">
                  <span className="font-medium">Courier</span>
                  <input
                    name="courier_name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Courier or driver name"
                    className="rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink">
                  <span className="font-medium">Tracking reference</span>
                  <input
                    name="tracking_ref"
                    required
                    minLength={3}
                    maxLength={80}
                    placeholder="e.g. BST-77881"
                    className="rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink"
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className={`${secondaryClass} self-start`}
                >
                  {pending ? "Saving." : "Confirm shipment"}
                </button>
              </form>
            </details>
          ) : null}

          {failedDelivery ? (
            <details className="rounded-2xl border border-red-200 bg-red-50/50 px-3 py-2">
              <summary
                className={`${dangerClass} inline-flex cursor-pointer list-none`}
              >
                {failedDelivery.label}
              </summary>
              <form action={formAction} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="suborder_id" value={suborderId} />
                <input type="hidden" name="vendor" value={vendorId} />
                <input type="hidden" name="expected_status" value={status} />
                <input type="hidden" name="status" value="cancelled" />
                <label className="flex flex-col gap-1 text-sm text-ink">
                  <span className="font-medium">Why did delivery fail?</span>
                  <select
                    name="reason_code"
                    required
                    defaultValue=""
                    className="rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink"
                  >
                    <option value="" disabled>
                      Choose a reason
                    </option>
                    {VENDOR_FAILED_DELIVERY_REASONS.map((code) => (
                      <option key={code} value={code}>
                        {ORDER_STATUS_REASON_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink">
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
                    className="rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink"
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  onClick={(event) => {
                    if (
                      failedDelivery.confirm &&
                      !window.confirm(failedDelivery.confirm)
                    ) {
                      event.preventDefault();
                    }
                  }}
                  className={`${dangerClass} self-start`}
                >
                  {pending ? "Saving." : "Cancel and restock"}
                </button>
              </form>
            </details>
          ) : null}
        </div>
      </div>

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
    </div>
  );
}
