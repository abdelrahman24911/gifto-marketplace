"use client";

import { useActionState } from "react";

import { adjustStock, type AdjustStockState } from "./actions";

const inputClass =
  "rounded-md border border-line-strong px-3 py-2 text-sm text-ink focus:border-berry focus:outline-none focus:ring-1 focus:ring-berry";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-ink-soft";

export function AdjustStockForm({
  productId,
  vendorId,
}: {
  productId: string;
  vendorId: string;
}) {
  const [state, formAction, pending] = useActionState<
    AdjustStockState,
    FormData
  >(adjustStock, null);

  // React 19 clears the form after an action; re-mount so the delta does not
  // linger after a successful change.
  const formKey = state && "attempt" in state ? `state-${state.attempt}` : "new";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="vendor" value={vendorId} />
      <input type="hidden" name="product_id" value={productId} />

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      {state && "success" in state ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {state.success} New stock is {state.stock}.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <label className={labelClass}>
          Change by
          <input
            type="number"
            name="delta"
            required
            step={1}
            placeholder="e.g. 10 or -3"
            className={inputClass}
          />
          <span className="text-xs font-normal text-ink-mute">
            Use a negative number to remove stock
          </span>
        </label>

        <label className={labelClass}>
          Reason (optional)
          <input
            type="text"
            name="note"
            maxLength={280}
            placeholder="e.g. Restock from supplier"
            className={inputClass}
          />
        </label>
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-berry px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Updating…" : "Update stock"}
        </button>
      </div>
    </form>
  );
}
