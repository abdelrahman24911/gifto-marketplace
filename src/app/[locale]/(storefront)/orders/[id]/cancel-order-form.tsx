"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { cancelGuestOrder, type GuestCancelState } from "./cancel-actions";

export function GuestCancelOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("order");
  const [state, formAction, pending] = useActionState<
    GuestCancelState,
    FormData
  >(cancelGuestOrder, null);

  return (
    <div className="mt-3">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              t("cancelConfirmPrompt"),
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="order_id" value={orderId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? t("cancelling") : t("cancelOrder")}
        </button>
      </form>

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
