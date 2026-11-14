"use client";

import { useActionState } from "react";

import { VENDOR_NEXT_STATUSES, type OrderStatus } from "@/lib/orders";

import { setSuborderStatus, type SuborderState } from "./actions";

const primaryClass =
  "rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60";
const secondaryClass =
  "rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-60";
const dangerClass =
  "rounded-full border border-red-300 bg-paper px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";

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

  return (
    <div>
      {options.length === 0 ? (
        <p className="text-sm text-ink-mute">
          No further action — this order line is closed.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            Move this line
          </p>
          <form action={formAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="suborder_id" value={suborderId} />
            <input type="hidden" name="vendor" value={vendorId} />
            {options.map((option) => (
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
                className={
                  option.value === "cancelled"
                    ? dangerClass
                    : option.value === "delivered"
                      ? primaryClass
                      : secondaryClass
                }
              >
                {pending ? "Saving…" : option.label}
              </button>
            ))}
          </form>
        </div>
      )}

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
