import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { ConfirmRecoveryForm } from "./confirm-form";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guest-order recovery confirmation page.
 *
 * The emailed link carries the recovery token in the URL fragment
 * (#token=...), which browsers never send to the server, and the order
 * id in the query. This page never redeems anything on GET: the form
 * posts the token in the request body to redeemGuestOrderRecovery.
 * Links emailed before the POST change (1-hour tokens) no longer work;
 * the customer requests a fresh link from /orders/recover.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("order");
  return {
    title: `${t("recoverOrder")} — Gifto`,
    robots: { index: false, follow: false },
  };
}

export default async function ConfirmRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const t = await getTranslations("order");
  const tc = await getTranslations("common");
  const { order } = await searchParams;
  const orderId = order ?? "";

  if (!UUID_PATTERN.test(orderId)) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {t("recoverOrder")}
        </h1>
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {t("recoverInvalid")}
        </p>
        <p className="mt-6 text-sm text-zinc-600">
          <Link
            href="/orders/recover"
            className="font-medium text-zinc-900 underline"
          >
            {t("sendRecoveryLink")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {t("recoverOrder")}
      </h1>
      <p className="mt-2 text-sm text-zinc-600">{t("recoverConfirming")}</p>
      <ConfirmRecoveryForm orderId={orderId} />
      <p className="mt-6 text-sm text-zinc-600">
        <Link href="/shops" className="font-medium text-zinc-900 underline">
          {tc("continueShopping")}
        </Link>
      </p>
    </div>
  );
}
