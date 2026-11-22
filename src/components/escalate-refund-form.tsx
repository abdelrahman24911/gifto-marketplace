"use client";

import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";

// P1-04: one-shot dispute escalation. A rejected refund case can be
// escalated exactly once; Gifto's second decision is final. The same form
// serves the signed-in and guest order pages — the server action is passed
// in by the page that renders it.
export type EscalateRefundState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

export function EscalateRefundForm({
  caseId,
  orderId,
  action,
}: {
  caseId: string;
  orderId: string;
  action: (
    prev: EscalateRefundState,
    formData: FormData,
  ) => Promise<EscalateRefundState>;
}) {
  const [state, formAction, pending] = useActionState<
    EscalateRefundState,
    FormData
  >(action, null);
  const t = useTranslations("order");
  const id = useId();

  return (
    <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <summary className="cursor-pointer text-sm font-medium text-zinc-800">
        {t("escalateTitle")}
      </summary>
      <form action={formAction} className="mt-3 grid gap-3">
        <input type="hidden" name="case_id" value={caseId} />
        <input type="hidden" name="order_id" value={orderId} />
        <p className="text-xs text-zinc-500">
          {t("escalateNote")}
        </p>
        <div>
          <label
            htmlFor={`${id}-note`}
            className="block text-xs font-medium text-zinc-700"
          >
            {t("whyDisagree")}
          </label>
          <textarea
            id={`${id}-note`}
            name="note"
            required
            minLength={5}
            maxLength={1000}
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            placeholder={t("explainOutcome")}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("sending") : t("escalateRefund")}
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
