"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  requestGuestOrderRecovery,
  type RecoverOrderState,
} from "./actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const buttonClass =
  "rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";

export function RecoverOrderForm({
  initialReference,
}: {
  initialReference?: string;
}) {
  const t = useTranslations("order");
  const [state, formAction, pending] = useActionState<
    RecoverOrderState,
    FormData
  >(requestGuestOrderRecovery, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <label className={labelClass}>
        {t("orderReference")}
        <input
          type="text"
          name="reference"
          autoComplete="off"
          required
          maxLength={16}
          defaultValue={initialReference}
          placeholder="GFT-ABCDEF123456"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        {t("contactLabel")}
        <input
          type="text"
          name="contact"
          autoComplete="off"
          required
          maxLength={254}
          placeholder="01000000000 or you@example.com"
          className={inputClass}
        />
        <span className="text-xs font-normal text-zinc-500">
          {t("contactHint")}
        </span>
      </label>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t("pleaseWait") : t("sendRecoveryLink")}
      </button>

      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : state && "success" in state ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
