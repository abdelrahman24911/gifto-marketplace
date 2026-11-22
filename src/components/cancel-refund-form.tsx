"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

// N-03 (D-09): the customer or guest who opened a case can cancel it
// while it is still open. The same form serves the signed-in and guest
// order pages — the server action is passed in by the page that renders
// it. The <details> disclosure is the confirmation step: opening it
// shows what cancelling means before the button is offered.
export type CancelRefundState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

export function CancelRefundForm({
  caseId,
  orderId,
  action,
}: {
  caseId: string;
  orderId: string;
  action: (
    prev: CancelRefundState,
    formData: FormData,
  ) => Promise<CancelRefundState>;
}) {
  const [state, formAction, pending] = useActionState<
    CancelRefundState,
    FormData
  >(action, null);
  const t = useTranslations("order");

  return (
    <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <summary className="cursor-pointer text-sm font-medium text-zinc-800">
        {t("cancelRefund")}
      </summary>
      <form action={formAction} className="mt-3 grid gap-3">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="order_id" value={orderId} />
        <p className="text-xs text-zinc-500">{t("cancelRefundNote")}</p>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("cancellingRefund") : t("cancelRefundConfirm")}
          </button>
        </div>
        {state && "error" in state ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {state.error}
          </p>
        ) : null}
        {state && "success" in state ? (
          <p role="status" className="text-sm text-emerald-700">
            {state.success}
          </p>
        ) : null}
      </form>
    </details>
  );
}
