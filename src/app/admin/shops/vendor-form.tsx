"use client";

import { useActionState } from "react";

import { createVendor, type CreateVendorState } from "../actions";

const inputClass =
  "w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15";
const labelClass =
  "flex flex-col gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-mute";

export function VendorForm() {
  const [state, formAction, pending] = useActionState<
    CreateVendorState,
    FormData
  >(createVendor, null);

  if (state && "success" in state) {
    return (
      <div className="rounded-2xl border border-success/25 bg-success-soft px-4 py-4">
        <p role="status" className="text-sm leading-relaxed text-ink">
          {state.success}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 text-sm font-semibold text-berry underline decoration-berry/30 underline-offset-4 hover:text-berry-deep"
        >
          Onboard another shop
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-ink-soft">
        New owners receive a secure invitation; existing accounts receive a
        password-reset link. The shop stays pending until you activate it.
      </p>

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-ink"
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
            placeholder="Blossom Gifts"
            autoComplete="organization"
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
            autoComplete="email"
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
            autoComplete="address-level2"
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
            autoComplete="address-level1"
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
            autoComplete="tel"
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
        className="self-start rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating and notifying…" : "Create shop and notify owner"}
      </button>
    </form>
  );
}
