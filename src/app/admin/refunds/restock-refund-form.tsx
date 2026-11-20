"use client";

import { useActionState } from "react";

import {
  restockRefundCase,
  type RestockRefundState,
} from "./actions";

// P1-04 (D-09): manual restock after the vendor confirmed receipt. Shown
// only on approved physical-return cases with a recorded receipt that have
// not been restocked yet. The RPC restocks exactly once.
export function RestockRefundForm({ caseId }: { caseId: string }) {
  const [state, formAction, pending] = useActionState<
    RestockRefundState,
    FormData
  >(restockRefundCase, null);

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="case_id" value={caseId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-success/30 bg-paper px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Restocking." : "Restock returned items"}
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
