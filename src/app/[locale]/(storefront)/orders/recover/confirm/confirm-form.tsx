"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { extractRecoveryToken } from "@/lib/recovery-token";

import {
  redeemGuestOrderRecovery,
  type RedeemRecoveryState,
} from "./actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const buttonClass =
  "rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Redeems the recovery token by POST, never by GET.
 *
 * The emailed link carries the token in the URL fragment (#token=...),
 * which browsers never send to the server. On mount this form reads the
 * fragment into the hidden token field, clears it from the address bar
 * so it does not linger in browser history, and submits it in the POST
 * body. If the link has no fragment (for example the customer opened
 * the page without the link, or the fragment was lost on the way), the
 * customer can paste the recovery code from the email instead — or the
 * full recovery link, which the form parses back into the code (S-07).
 * The same POST path, no GET redemption anywhere. The token lives in an
 * uncontrolled hidden field on purpose: it is read from an external
 * system (the URL fragment) on mount, and keeping it out of React state
 * avoids a hydration mismatch between the server render (no fragment)
 * and the client.
 */
export function ConfirmRecoveryForm({ orderId }: { orderId: string }) {
  const t = useTranslations("order");
  const [state, formAction, pending] = useActionState<
    RedeemRecoveryState,
    FormData
  >(redeemGuestOrderRecovery, null);
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    const fragmentToken = new URLSearchParams(
      window.location.hash.slice(1),
    ).get("token");
    if (!fragmentToken || submittedRef.current) return;
    submittedRef.current = true;
    // Clear the fragment so the token does not stay in the address bar
    // or browser history after redemption.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    if (tokenRef.current) tokenRef.current.value = fragmentToken;
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={formAction} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="order" value={orderId} />
      <input ref={tokenRef} type="hidden" name="token" defaultValue="" />
      <label className={labelClass}>
        {t("recoverPasteCode")}
        <input
          type="text"
          className={inputClass}
          placeholder="••••••••"
          autoComplete="off"
          onChange={(event) => {
            if (tokenRef.current) {
              // S-07: accept the raw code or the full recovery link.
              tokenRef.current.value = extractRecoveryToken(
                event.target.value,
              );
            }
          }}
        />
      </label>
      <div>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? t("recoverConfirming") : t("recoverContinue")}
        </button>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
