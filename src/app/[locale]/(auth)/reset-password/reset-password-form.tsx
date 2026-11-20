"use client";

import { useActionState } from "react";

import { resetPassword, type ResetPasswordState } from "./actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";
const buttonClass =
  "rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPassword, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <label className={labelClass}>
        New password
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={6}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Confirm new password
        <input
          type="password"
          name="password_confirm"
          autoComplete="new-password"
          required
          minLength={6}
          className={inputClass}
        />
      </label>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Please wait…" : "Set new password"}
      </button>

      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
