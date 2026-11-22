"use client";

import { useActionState, useId } from "react";

import {
  confirmRefundReceipt,
  type VendorRefundState,
} from "./actions";

export function ConfirmReceiptForm({
  caseId,
  vendorId,
}: {
  caseId: string;
  vendorId: string;
}) {
  const [state, formAction, pending] = useActionState<
    VendorRefundState,
    FormData
  >(confirmRefundReceipt, null);
  const id = useId();

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="vendor_id" value={vendorId} />
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-ink-mute">
          What arrived
        </span>
        <div className="mt-2 grid gap-2">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="radio"
              name="condition"
              value="good"
              className="mt-0.5"
            />
            <span>
              Good condition
              <span className="block text-xs text-ink-mute">
                The customer pays the return courier; the item can be
                restocked after inspection.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="radio"
              name="condition"
              value="wrong_item"
              className="mt-0.5"
            />
            <span>
              Wrong item
              <span className="block text-xs text-ink-mute">
                The shop pays the return courier; the item is not the
                product ordered, so it is never restocked against this
                order.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="radio"
              name="condition"
              value="damaged"
              className="mt-0.5"
            />
            <span>
              Damaged
              <span className="block text-xs text-ink-mute">
                The shop pays the return courier; a damaged item is never
                restocked.
              </span>
            </span>
          </label>
        </div>
      </div>
      <div>
        <label
          htmlFor={`${id}-note`}
          className="block text-xs font-semibold uppercase tracking-wide text-ink-mute"
        >
          Inspection note (optional)
        </label>
        <input
          id={`${id}-note`}
          name="note"
          maxLength={1000}
          className="mt-1 w-full rounded-lg border border-line-strong bg-paper-soft px-3 py-2 text-sm text-ink"
          placeholder="Condition of the returned gift"
        />
        <p className="mt-1 text-xs text-ink-mute">
          Confirming receipt marks the order returned. It does not restock
          the item — Gifto restocks it manually after your inspection.
        </p>
      </div>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving." : "Confirm item received"}
        </button>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm text-success">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
