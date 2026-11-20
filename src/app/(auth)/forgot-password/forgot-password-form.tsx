"use client";

import { useActionState } from "react";

import { requestPasswordReset, type RequestResetState } from "./actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const buttonClass =
  "rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<
    RequestResetState,
    FormData
  >(requestPasswordReset, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </label>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Please wait…" : "Send reset link"}
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
