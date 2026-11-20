"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  WORKING_DAY_LABELS,
  WORKING_DAYS,
} from "@/lib/vendor-settings";
import {
  GOVERNORATES,
  governorateLabel,
  partitionGovernorates,
} from "@/lib/governorates";

import {
  saveVendorSettings,
  type VendorSettingsState,
  type VendorSettingsValues,
} from "./actions";

const inputClass =
  "w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/20 disabled:cursor-not-allowed disabled:bg-paper-deep/60 disabled:text-ink-mute";
const labelClass = "flex flex-col gap-1 text-sm font-medium text-ink-soft";

export function StoreSettingsForm({
  vendorId,
  vendorSlug,
  initial,
  canEdit,
}: {
  vendorId: string;
  vendorSlug: string;
  initial: VendorSettingsValues;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    VendorSettingsState,
    FormData
  >(saveVendorSettings, null);

  // React 19 resets forms after an action. Re-mount with the echoed values so a
  // failed submit (and a successful one) preserves exactly what was saved.
  const values = state?.values ?? initial;
  const formKey = state?.attempt ? `state-${state.attempt}` : "pristine";

  // P1-06: stored governorates are split into canonical ones (the picker)
  // and unmappable ones, which are shown separately and kept as-is unless
  // the vendor unticks them — never silently dropped.
  const storedGovernorates = partitionGovernorates(
    values.governorates
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="vendor" value={vendorId} />

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
        >
          {state.success}
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
          autoComplete="organization"
          defaultValue={values.name}
          disabled={!canEdit}
          className={inputClass}
        />
        <span className="text-xs font-normal text-ink-mute">
          Shown across Gifto. Your shop URL stays {`/shops/${vendorSlug}`}.
        </span>
      </label>

      <label className={labelClass}>
        Description
        <textarea
          name="description"
          rows={4}
          maxLength={600}
          defaultValue={values.description}
          disabled={!canEdit}
          placeholder="What you make, who you make it for, and what makes your shop special."
          className={inputClass}
        />
        <span className="text-xs font-normal text-ink-mute">
          Up to 600 characters. This appears on your public shop page.
        </span>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className={labelClass}>
          Contact phone
          <input
            type="tel"
            name="contact_phone"
            maxLength={30}
            autoComplete="tel"
            defaultValue={values.contactPhone}
            disabled={!canEdit}
            placeholder="+20 100 000 0000"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Contact email
          <input
            type="email"
            name="contact_email"
            maxLength={160}
            autoComplete="email"
            defaultValue={values.contactEmail}
            disabled={!canEdit}
            placeholder="orders@yourshop.com"
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className={labelClass}>
          City
          <input
            type="text"
            name="city"
            maxLength={80}
            autoComplete="address-level2"
            defaultValue={values.city}
            disabled={!canEdit}
            placeholder="e.g. Alexandria"
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Governorate
          <input
            type="text"
            name="governorate"
            maxLength={80}
            autoComplete="address-level1"
            defaultValue={values.governorate}
            disabled={!canEdit}
            placeholder="e.g. Alexandria"
            className={inputClass}
          />
        </label>
      </div>

      <label className={labelClass}>
        Street address (private)
        <input
          type="text"
          name="address_line"
          minLength={5}
          maxLength={300}
          autoComplete="street-address"
          defaultValue={values.addressLine}
          disabled={!canEdit}
          placeholder="Building, street and area"
          className={inputClass}
        />
        <span className="text-xs font-normal text-ink-mute">
          Used for pickup and support. Only your shop members and Gifto admins
          can see this; it is never shown on the public shop page.
        </span>
      </label>

      <fieldset className="rounded-2xl border border-line bg-paper-soft p-4">
        <legend className="px-1 text-sm font-medium text-ink-soft">
          Delivery coverage
        </legend>
        <p className="mt-1 text-xs text-ink-mute">
          Tick every governorate this shop delivers to. Areas are free-text,
          separated with commas or new lines — up to 30 entries of 80
          characters each. Leaving both lists empty means the shop delivers
          everywhere.
        </p>

        <div className="mt-4">
          <p className="text-sm font-medium text-ink-soft">Governorates</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {GOVERNORATES.map((governorate) => (
              <label
                key={governorate.en}
                className="flex items-center gap-2 text-sm font-normal text-ink"
              >
                <input
                  type="checkbox"
                  name="governorates"
                  value={governorate.en}
                  defaultChecked={storedGovernorates.canonical.includes(
                    governorate.en,
                  )}
                  disabled={!canEdit}
                />
                {governorateLabel(governorate.en)}
              </label>
            ))}
          </div>
          {storedGovernorates.unmappable.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">
                Saved entries that are not in the standard list — kept as-is:
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {storedGovernorates.unmappable.map((value) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm font-normal"
                  >
                    <input
                      type="checkbox"
                      name="unmappable_governorates"
                      value={value}
                      defaultChecked
                      disabled={!canEdit}
                    />
                    {value}
                  </label>
                ))}
              </div>
              <p className="mt-2">
                Untick one to remove it. These are preserved on save so
                nothing is silently dropped.
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <label className={labelClass}>
            Areas or districts
            <textarea
              name="areas"
              rows={3}
              defaultValue={values.areas}
              disabled={!canEdit}
              placeholder="Smouha, Sidi Gaber"
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-paper-soft p-4">
        <legend className="px-1 text-sm font-medium text-ink-soft">
          Working hours
        </legend>
        <p className="mt-1 text-xs text-ink-mute">
          Optional. Leave both times blank for a closed day. Use 24-hour times;
          closing time must be after opening time.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {WORKING_DAYS.map((day) => {
            const slot = values.workingHours[day];
            return (
              <div
                key={day}
                className="grid items-center gap-2 sm:grid-cols-[7rem_1fr_auto_1fr]"
              >
                <span className="text-sm font-medium text-ink-soft">
                  {WORKING_DAY_LABELS[day]}
                </span>
                <input
                  type="time"
                  name={`hours_${day}_open`}
                  aria-label={`${WORKING_DAY_LABELS[day]} opening time`}
                  defaultValue={slot?.open ?? ""}
                  disabled={!canEdit}
                  className={inputClass}
                />
                <span className="hidden text-xs text-ink-mute sm:block">to</span>
                <input
                  type="time"
                  name={`hours_${day}_close`}
                  aria-label={`${WORKING_DAY_LABELS[day]} closing time`}
                  defaultValue={slot?.close ?? ""}
                  disabled={!canEdit}
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-line bg-paper-soft p-4">
        <legend className="px-1 text-sm font-medium text-ink-soft">
          Preparation time
        </legend>
        <p className="mt-1 text-xs text-ink-mute">
          Optional. Enter a range from 0 to 60 days so customers know how long
          preparation takes. Leave both blank if you do not want to show a lead
          time.
        </p>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>
            Minimum preparation days
            <input
              type="number"
              name="prep_time_min_days"
              min={0}
              max={60}
              step={1}
              inputMode="numeric"
              defaultValue={values.prepTimeMinDays}
              disabled={!canEdit}
              placeholder="e.g. 1"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Maximum preparation days
            <input
              type="number"
              name="prep_time_max_days"
              min={0}
              max={60}
              step={1}
              inputMode="numeric"
              defaultValue={values.prepTimeMaxDays}
              disabled={!canEdit}
              placeholder="e.g. 3"
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save settings"}
          </button>
          <Link
            href={`/shops/${vendorSlug}`}
            className="rounded-full border border-line-strong bg-paper-soft px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper-deep"
          >
            View public shop
          </Link>
        </div>
      ) : (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink">
          You are a staff member of this shop. Only the owner can edit the store
          profile.
        </p>
      )}
    </form>
  );
}
