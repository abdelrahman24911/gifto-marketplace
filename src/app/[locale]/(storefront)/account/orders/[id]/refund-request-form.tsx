"use client";

import { useActionState, useId } from "react";
import { useLocale, useTranslations } from "next-intl";

import { formatEgp, type MoneyLocale } from "@/lib/money";

import {
  openRefundCase,
  type OpenRefundState,
} from "./refund-actions";

export function RefundRequestForm({
  orderId,
  orderVendorId,
  subtotalMinor,
}: {
  orderId: string;
  orderVendorId: string;
  subtotalMinor: number;
}) {
  const [state, formAction, pending] = useActionState<
    OpenRefundState,
    FormData
  >(openRefundCase, null);
  const t = useTranslations("order");
  const locale = useLocale() as MoneyLocale;
  const id = useId();

  return (
    <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <summary className="cursor-pointer text-sm font-medium text-zinc-800">
        {t("requestRefund")}
      </summary>
      <form action={formAction} className="mt-3 grid gap-3">
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="order_vendor_id" value={orderVendorId} />

        <div>
          <label
            htmlFor={`${id}-reason`}
            className="block text-xs font-medium text-zinc-700"
          >
            {t("refundReason")}
          </label>
          <textarea
            id={`${id}-reason`}
            name="reason"
            required
            minLength={5}
            maxLength={1000}
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            placeholder={t("describeProblem")}
          />
        </div>

        <div>
          <label
            htmlFor={`${id}-amount`}
            className="block text-xs font-medium text-zinc-700"
          >
            {t("amountRequested")}
          </label>
          <input
            id={`${id}-amount`}
            name="requested_amount"
            inputMode="decimal"
            className="mt-1 w-full max-w-48 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            placeholder={(subtotalMinor / 100).toFixed(2)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            {t("amountHint", { subtotal: formatEgp(subtotalMinor, locale) })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("sending") : t("sendRefundRequest")}
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
