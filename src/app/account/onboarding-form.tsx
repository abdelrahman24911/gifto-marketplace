"use client";

import { useActionState } from "react";

import { applyAsVendor, type ApplyState } from "./actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    applyAsVendor,
    null,
  );

  if (state && "success" in state) {
    return (
      <p
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800"
      >
        {state.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Apply to sell on Gifto
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Your shop will be reviewed before it becomes publicly visible.
        </p>
      </div>

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <label className={labelClass}>
        Shop name
        <input
          type="text"
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Blossom Gifts"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        What do you sell?
        <textarea
          name="description"
          rows={3}
          maxLength={600}
          placeholder="Handmade bouquets, gift boxes, wrapping…"
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          City
          <input
            type="text"
            name="city"
            maxLength={80}
            placeholder="Alexandria"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Governorate
          <input
            type="text"
            name="governorate"
            maxLength={80}
            placeholder="Alexandria"
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Contact phone
          <input
            type="tel"
            name="phone"
            maxLength={30}
            placeholder="+20 …"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Contact email
          <input
            type="email"
            name="email"
            maxLength={160}
            placeholder="shop@example.com"
            className={inputClass}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
