import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth";
import { localePrefixFor } from "@/lib/locale-path";
import { pageMetadata } from "@/lib/metadata";
import type { AppLocale } from "@/i18n/routing";

import { AddressForm } from "./address-form";
import { AddressRowActions } from "./address-actions";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("addressBook");
  return pageMetadata({
    title: `${t("title")} — Gifto`,
    description: t("title"),
    path: `${localePrefixFor(locale)}/account/addresses`,
  });
}

export default async function AccountAddressesPage() {
  const t = await getTranslations("addressBook");
  const { supabase, user } = await requireUser();

  const { data: addresses } = await supabase
    .from("saved_addresses")
    .select(
      "id, label, recipient_name, contact_phone, address_line, city, governorate, notes, is_default",
    )
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-zinc-500">{t("emptyBody")}</p>

      {!addresses || addresses.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
          {t("empty")}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900">
                    {address.label}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700">
                    {address.recipient_name} · {address.contact_phone}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-700">
                    {address.address_line}, {address.city},{" "}
                    {address.governorate}
                  </p>
                  {address.notes ? (
                    <p className="mt-1 text-sm text-zinc-500">
                      {address.notes}
                    </p>
                  ) : null}
                </div>
                <AddressRowActions
                  address={{
                    id: address.id,
                    label: address.label,
                    recipientName: address.recipient_name,
                    contactPhone: address.contact_phone,
                    addressLine: address.address_line,
                    city: address.city,
                    governorate: address.governorate,
                    notes: address.notes,
                    isDefault: address.is_default,
                  }}
                  isDefault={address.is_default}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddressForm />
    </main>
  );
}
