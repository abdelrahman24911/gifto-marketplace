"use client";

import { useActionState } from "react";

import {
  acknowledgeRefundCase,
  type VendorRefundState,
} from "./actions";

export function AcknowledgeRefundForm({
  caseId,
  vendorId,
}: {
  caseId: string;
  vendorId: string;
}) {
  const [state, formAction, pending] = useActionState<
    VendorRefundState,
    FormData
  >(acknowledgeRefundCase, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="case_id" value={caseId} />
      <input type="hidden" name="vendor_id" value={vendorId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving." : "Acknowledge"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="mt-2 text-sm text-success">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
