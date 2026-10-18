"use client";

import { useActionState } from "react";

import { VENDOR_NEXT_STATUSES, type OrderStatus } from "@/lib/orders";

import { setSuborderStatus, type SuborderState } from "./actions";

const primaryClass =
  "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60";
const dangerClass =
  "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60";

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
    <div className="mt-3">
      {options.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No further action — this order line is closed.
        </p>
      ) : (
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
      )}

      {state && "error" in state ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="mt-2 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
