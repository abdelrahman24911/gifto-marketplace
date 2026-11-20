"use client";

import { useActionState } from "react";

import { ORDER_STATUS_REASON_LABELS } from "@/lib/order-status-reasons";
import { ADMIN_NEXT_STATUSES, type OrderStatus } from "@/lib/orders";

import { setAdminSuborderStatus, type AdminSuborderState } from "./actions";

const primaryClass =
  "rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60";
const secondaryClass =
  "rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-60";
const dangerClass =
  "rounded-full border border-red-300 bg-paper px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";

function optionClass(value: OrderStatus) {
  if (value === "cancelled" || value === "returned") return dangerClass;
  if (value === "delivered") return primaryClass;
  return secondaryClass;
}

function isException(status: OrderStatus) {
  return status === "cancelled" || status === "returned";
}

export function AdminSuborderActions({
  suborderId,
  orderId,
  status,
}: {
  suborderId: string;
  orderId: string;
  status: OrderStatus;
}) {
  const [state, formAction, pending] = useActionState<
    AdminSuborderState,
    FormData
  >(setAdminSuborderStatus, null);

  const options = ADMIN_NEXT_STATUSES[status] ?? [];
  // P1-15: shipping records the handover (courier + tracking reference),
  // so it gets a form of its own instead of a bare button.
  const shipOption = options.find((option) => option.value === "shipped");
  const directOptions = options.filter(
    (option) => !isException(option.value) && option.value !== "shipped",
  );
  const exceptionOptions = options.filter((option) =>
    isException(option.value),
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
        {directOptions.length > 0 ? (
          <form action={formAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="suborder_id" value={suborderId} />
            <input type="hidden" name="order_id" value={orderId} />
            <input type="hidden" name="expected_status" value={status} />
            {directOptions.map((option) => (
              <button
                key={option.value}
                type="submit"
                name="status"
                value={option.value}
                disabled={pending}
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
              <input type="hidden" name="order_id" value={orderId} />
              <input type="hidden" name="expected_status" value={status} />
              <input type="hidden" name="status" value="shipped" />
              <p className="text-sm text-ink-soft">
                Record who takes the parcel and under what reference. The
                shop and the customer see the same details.
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

        {exceptionOptions.map((option) => (
          <details
            key={option.value}
            className="rounded-2xl border border-red-200 bg-red-50/50 px-3 py-2"
          >
            <summary
              className={`${dangerClass} inline-flex cursor-pointer list-none`}
            >
              {option.label}
            </summary>
            <form action={formAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="suborder_id" value={suborderId} />
              <input type="hidden" name="order_id" value={orderId} />
              <input type="hidden" name="expected_status" value={status} />
              <input type="hidden" name="status" value={option.value} />
              <label className="flex flex-col gap-1 text-sm text-ink">
                <span className="font-medium">Reason</span>
                <select
                  name="reason_code"
                  required
                  defaultValue=""
                  className="rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink"
                >
                  <option value="" disabled>
                    Choose a reason
                  </option>
                  {Object.entries(ORDER_STATUS_REASON_LABELS).map(
                    ([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ),
                  )}
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
                className={`${dangerClass} self-start`}
              >
                {pending
                  ? "Saving."
                  : option.value === "returned"
                    ? "Confirm return"
                    : "Confirm cancellation"}
              </button>
            </form>
          </details>
        ))}
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
