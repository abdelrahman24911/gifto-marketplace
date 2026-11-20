import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { RecoverOrderForm } from "./recover-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("order");
  return {
    title: `${t("recoverOrder")} — Gifto`,
    robots: { index: false, follow: false },
  };
}

export default async function RecoverOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("order");
  const tc = await getTranslations("common");
  const { error } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {t("recoverOrder")}
      </h1>
      <p className="mt-2 text-sm text-zinc-600">{t("recoverBody")}</p>

      {error === "invalid" ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {t("recoverInvalid")}
        </p>
      ) : null}

      <RecoverOrderForm />

      <p className="mt-6 text-sm text-zinc-600">
        <Link href="/shops" className="font-medium text-zinc-900 underline">
          {tc("continueShopping")}
        </Link>
      </p>
    </div>
  );
}
