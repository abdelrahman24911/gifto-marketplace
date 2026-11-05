"use client";

import { useActionState } from "react";

import { createVendor, type CreateVendorState } from "./actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

export function VendorForm() {
  const [state, formAction, pending] = useActionState<
    CreateVendorState,
    FormData
  >(createVendor, null);

  if (state && "success" in state) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
        <p role="status" className="text-sm text-emerald-800">
          {state.success}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 inline-block text-sm font-medium text-emerald-900 underline"
        >
          Add another shop
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600">
        New owners receive a secure invitation; owners who already have an
        account receive a password-reset link. The shop remains pending until
        you activate it.
      </p>

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
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
          Business email
          <input
            type="email"
            name="email"
            required
            maxLength={160}
            placeholder="owner@shop.com"
            className={inputClass}
          />
        </label>
      </div>

      <label className={labelClass}>
        Description
        <textarea
          name="description"
          rows={3}
          maxLength={600}
          placeholder="What the shop sells, in the owner's words"
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
            placeholder="+20 100 000 0000"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Commission %
          <input
            type="number"
            name="commission_percent"
            min={0}
            max={100}
            step={0.01}
            defaultValue={10}
            className={inputClass}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating and notifying owner…" : "Create shop and notify owner"}
      </button>
    </form>
  );
}
