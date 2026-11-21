"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import {
  GOVERNORATES,
  governorateLabel,
} from "@/lib/governorates";

import {
  addSavedAddress,
  updateSavedAddress,
  type AddressBookState,
} from "./actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

export type AddressFormInitial = {
  id: string;
  label: string;
  recipientName: string;
  contactPhone: string;
  addressLine: string;
  city: string;
  governorate: string;
  notes: string | null;
  isDefault: boolean;
};

/**
 * Add-an-address form, and (with `initial`) the edit form for one saved
 * address (R-08 — previously a typo meant delete-and-re-add). The
 * address book is a snapshot store: saving an address never touches a
 * placed order, and the default (first saved, or the one marked here)
 * pre-fills checkout.
 */
export function AddressForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: AddressFormInitial;
  onCancel?: () => void;
  onSaved?: () => void;
} = {}) {
  const t = useTranslations("addressBook");
  const tc = useTranslations("checkout");
  const editing = initial !== undefined;
  const [state, formAction, pending] = useActionState<
    AddressBookState,
    FormData
  >(editing ? updateSavedAddress : addSavedAddress, null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastAttempt = useRef(0);

  useEffect(() => {
    if (
      state &&
      "success" in state &&
      state.attempt !== lastAttempt.current
    ) {
      lastAttempt.current = state.attempt;
      formRef.current?.reset();
      onSaved?.();
    }
  }, [state, onSaved]);

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-900">
        {editing ? t("editTitle") : t("addTitle")}
      </h2>
      {editing ? null : (
        <p className="mt-1 text-sm text-zinc-500">{t("makeDefaultNote")}</p>
      )}

      <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-4">
        {editing ? (
          <input type="hidden" name="address_id" value={initial.id} />
        ) : null}
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

        <label className={labelClass}>
          {t("label")}
          <input
            type="text"
            name="label"
            defaultValue={initial?.label}
            required
            minLength={2}
            maxLength={40}
            placeholder={t("labelPlaceholder")}
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            {tc("recipientName")}
            <input
              type="text"
              name="recipient_name"
              defaultValue={initial?.recipientName}
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            {tc("contactPhone")}
            <input
              type="tel"
              name="contact_phone"
              defaultValue={initial?.contactPhone}
              required
              minLength={5}
              maxLength={30}
              inputMode="tel"
              autoComplete="tel"
              className={inputClass}
            />
          </label>
        </div>

        <label className={labelClass}>
          {tc("address")}
          <input
            type="text"
            name="address_line"
            defaultValue={initial?.addressLine}
            required
            minLength={5}
            maxLength={300}
            autoComplete="street-address"
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            {tc("city")}
            <input
              type="text"
              name="city"
              defaultValue={initial?.city}
              required
              minLength={2}
              maxLength={80}
              autoComplete="address-level2"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            {tc("governorate")}
            <select
              name="governorate"
              required
              autoComplete="address-level1"
              defaultValue={initial?.governorate ?? ""}
              className={inputClass}
            >
              <option value="" disabled>
                {tc("chooseGovernorate")}
              </option>
              {GOVERNORATES.map((governorate) => (
                <option key={governorate.en} value={governorate.en}>
                  {governorateLabel(governorate.en)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass}>
          {tc("deliveryNotes")}
          <textarea
            name="notes"
            defaultValue={initial?.notes ?? ""}
            rows={2}
            maxLength={1000}
            className={inputClass}
          />
        </label>

        {editing && initial.isDefault ? null : (
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input
              type="checkbox"
              name="is_default"
              value="1"
              className="h-4 w-4 accent-zinc-900"
            />
            {t("setDefault")}
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="mt-1 w-fit rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("saving") : editing ? t("saveAddress") : t("addAddress")}
          </button>
          {editing && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="mt-1 w-fit rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
            >
              {t("cancel")}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
