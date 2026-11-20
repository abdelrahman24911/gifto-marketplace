import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localePrefixFor } from "@/lib/locale-path";
import { pageMetadata } from "@/lib/metadata";
import type { AppLocale } from "@/i18n/routing";
import type { MoneyLocale } from "@/lib/money";

import {
  guestCookieName,
  isValidGuestToken,
  sha256Hex,
} from "@/lib/guest-order";
import { formatEgp } from "@/lib/money";
import { isOrderStatus } from "@/lib/orders";
import {
  REFUND_CASE_STATUS_STYLES,
  canRequestRefundWithinWindow,
  refundWindowEndsAt,
} from "@/lib/refunds";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { EscalateRefundForm } from "@/components/escalate-refund-form";
import { CancelRefundForm } from "@/components/cancel-refund-form";

import { GuestRefundRequestForm } from "./refund-request-form";
import { GuestCancelOrderButton } from "./cancel-order-form";
import { ClaimOrderButton } from "./claim-order-button";
import {
  cancelGuestRefundCase,
  escalateGuestRefundCase,
} from "./refund-actions";

import type {
  OrderStatus,
  RefundCaseStatus,
} from "@/lib/supabase/database.types";

type GuestRefundCase = {
  id: string;
  order_vendor_id: string;
  status: RefundCaseStatus;
  reason: string;
  requested_amount_minor: number | null;
  refund_amount_minor: number | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  escalation_count: number;
  escalated_at: string | null;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("order");
  return {
    ...pageMetadata({
      title: `${t("confirmed")} — Gifto`,
      description: t("confirmed"),
      path: `${localePrefixFor(locale)}/orders`,
      noIndex: true,
    }),
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GuestOrderItem = {
  product_name: string;
  product_slug: string;
  unit_price_minor: number;
  quantity: number;
  line_total_minor: number;
};

type GuestOrderVendor = {
  id: string;
  status: string;
  subtotal_minor: number;
  delivered_at: string | null;
  courier_name: string | null;
  tracking_ref: string | null;
  handed_over_at: string | null;
  vendor_name: string;
  vendor_slug: string;
  items: GuestOrderItem[];
};

type GuestOrder = {
  id: string;
  reference: string | null;
  status: string;
  subtotal_minor: number;
  delivery_fee_minor: number;
  total_minor: number;
  recipient_name: string;
  contact_phone: string;
  address_line: string;
  city: string;
  governorate: string;
  notes: string | null;
  created_at: string;
  vendors: GuestOrderVendor[];
};

function isGuestOrder(value: unknown): value is GuestOrder {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    Array.isArray((value as { vendors?: unknown }).vendors)
  );
}

/**
 * Guest order confirmation.
 *
 * Access is granted only when the order id in the path AND the HttpOnly,
 * order-scoped token cookie both match the hash stored on the order. The token
 * is never placed in a URL, so the page cannot be opened from a shared link or
 * by guessing an order UUID. Authenticated order history stays at
 * /account/orders/[id].
 */
export default async function GuestOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("order");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as AppLocale;
  const moneyLocale = locale as MoneyLocale;
  const dateLocale = locale === "ar" ? "ar-EG" : "en-GB";
  const statusLabels: Record<OrderStatus, string> = {
    placed: t("statusPlaced"),
    confirmed: t("statusConfirmed"),
    shipped: t("statusShipped"),
    delivered: t("statusDelivered"),
    cancelled: t("statusCancelled"),
    returned: t("statusReturned"),
    partially_completed: t("statusPartiallyCompleted"),
  };
  const statusHelp: Record<OrderStatus, string> = {
    placed: t("statusHelpPlaced"),
    confirmed: t("statusHelpConfirmed"),
    shipped: t("statusHelpShipped"),
    delivered: t("statusHelpDelivered"),
    cancelled: t("statusHelpCancelled"),
    returned: t("statusHelpReturned"),
    partially_completed: t("statusHelpPartiallyCompleted"),
  };
  const refundLabels: Record<RefundCaseStatus, string> = {
    open: t("refundOpen"),
    approved: t("refundApproved"),
    rejected: t("refundRejected"),
    cancelled: t("refundCancelled"),
  };

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) notFound();

  const cookieStore = await cookies();
  const token = cookieStore.get(guestCookieName(id))?.value;

  if (!isValidGuestToken(token)) notFound();

  const service = createServiceClient();
  const { data, error } = await service.rpc("get_guest_order", {
    p_order_id: id,
    p_token_hash: sha256Hex(token),
  });

  if (error || !isGuestOrder(data)) {
    // P1-02: distinguish an expired token (recovery is possible) from an
    // unknown one. This check needs the token itself, so it reveals nothing
    // to a caller who does not already hold it.
    const { data: expired } = await service.rpc("guest_token_expired", {
      p_order_id: id,
      p_token_hash: sha256Hex(token),
    });
    if (expired === true) {
      return (
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <h1 className="text-2xl font-semibold tracking-tight text-amber-900">
              {t("expiredTitle")}
            </h1>
            <p className="mt-1 text-sm text-amber-800">{t("expiredBody")}</p>
            <Link
              href="/orders/recover"
              className="mt-3 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              {t("recoverOrder")}
            </Link>
          </div>
        </div>
      );
    }
    notFound();
  }

  const order = data;
  const reference = order.reference ?? `#${order.id.slice(0, 8)}`;
  const status = isOrderStatus(order.status) ? order.status : "placed";

  const { data: refundData, error: refundError } = await service.rpc(
    "get_guest_refund_cases",
    {
      p_order_id: id,
      p_token_hash: sha256Hex(token),
    },
  );
  const refundCases = refundError
    ? []
    : ((refundData ?? []) as GuestRefundCase[]);

  // P1-02: a signed-in viewer holding the guest token can claim the order
  // onto their account.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      {status === "cancelled" ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {t("cancelled")}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {t("cancelledBody", { reference })}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-900">
            {t("confirmed")}
          </h1>
          <p className="mt-1 text-sm text-emerald-800">
            {t("confirmedBody", { reference })}
          </p>
        </div>
      )}

      <p className="mt-4 text-sm text-zinc-600">
        {statusHelp[status]}{" "}
        {t.rich("help", {
          recover: (chunks) => (
            <Link
              href="/orders/recover"
              className="font-medium text-zinc-900 underline"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      {status === "placed" ? (
        <GuestCancelOrderButton orderId={order.id} />
      ) : null}

      {user ? <ClaimOrderButton orderId={order.id} /> : null}

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {t("deliveryDetails")}
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">{t("recipient")}</dt>
            <dd className="text-zinc-900">{order.recipient_name}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("phone")}</dt>
            <dd className="text-zinc-900">{order.contact_phone}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">{t("address")}</dt>
            <dd className="text-zinc-900">
              {order.address_line}, {order.city}, {order.governorate}
            </dd>
          </div>
          {order.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">{t("notes")}</dt>
              <dd className="text-zinc-900">{order.notes}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {refundError ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {t("refundLoadError")}
        </p>
      ) : null}

      <section className="mt-6 flex flex-col gap-4">
        {order.vendors.map((vendor) => {
          const vendorCases = refundCases.filter(
            (refundCase) => refundCase.order_vendor_id === vendor.id,
          );
          const hasOpenCase = vendorCases.some(
            (refundCase) => refundCase.status === "open",
          );

          return (
          <div
            key={vendor.id}
            className="rounded-2xl border border-zinc-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/shops/${vendor.vendor_slug}`}
                className="font-medium text-zinc-900 underline-offset-2 hover:underline"
              >
                {vendor.vendor_name}
              </Link>
              {isOrderStatus(vendor.status) ? (
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
                  {statusLabels[vendor.status as OrderStatus]}
                </span>
              ) : null}
            </div>

            {vendor.courier_name ? (
              <p className="mt-2 text-sm text-zinc-600">
                Shipped via {vendor.courier_name}
                {vendor.tracking_ref ? ` · ${vendor.tracking_ref}` : ""}
                {vendor.handed_over_at
                  ? ` · handed over ${new Date(vendor.handed_over_at).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" })}`
                  : ""}
              </p>
            ) : null}

            <ul className="mt-4 flex flex-col divide-y divide-zinc-100">
              {vendor.items.map((item, index) => (
                <li
                  key={`${vendor.id}-${item.product_slug}-${index}`}
                  className="flex items-start justify-between gap-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-zinc-900">
                      {item.product_name}
                    </span>
                    <p className="text-zinc-500">
                      {formatEgp(item.unit_price_minor, moneyLocale)} × {item.quantity}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-medium text-zinc-900">
                    {formatEgp(item.line_total_minor, moneyLocale)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-2 text-right text-sm text-zinc-600">
              {t("shopSubtotal")}{" "}
              <span className="font-medium text-zinc-900">
                {formatEgp(vendor.subtotal_minor, moneyLocale)}
              </span>
            </p>

            {vendorCases.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2 border-t border-zinc-100 pt-4">
                {vendorCases.map((refundCase) => (
                  <div
                    key={refundCase.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${REFUND_CASE_STATUS_STYLES[refundCase.status]}`}
                      >
                        {t("refund", { status: refundLabels[refundCase.status] })}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {new Date(refundCase.created_at).toLocaleDateString(
                          dateLocale,
                          { dateStyle: "medium" },
                        )}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-zinc-700">
                      {refundCase.reason}
                    </p>
                    {refundCase.refund_amount_minor !== null ? (
                      <p className="mt-1 text-xs font-medium text-zinc-700">
                        {t("approvedAmount", {
                          amount: formatEgp(
                            refundCase.refund_amount_minor,
                            moneyLocale,
                          ),
                        })}
                      </p>
                    ) : null}
                    {refundCase.resolution_note ? (
                      <p className="mt-1 text-xs text-zinc-600">
                        {t("giftoNote", { note: refundCase.resolution_note })}
                      </p>
                    ) : null}
                    {refundCase.status === "open" &&
                    refundCase.escalation_count > 0 ? (
                      <p className="mt-1 text-xs font-medium text-zinc-700">
                        {t("escalated")}
                      </p>
                    ) : null}
                    {refundCase.status === "open" ? (
                      <CancelRefundForm
                        caseId={refundCase.id}
                        orderId={order.id}
                        action={cancelGuestRefundCase}
                      />
                    ) : null}
                    {refundCase.status === "cancelled" &&
                    refundCase.resolved_at ? (
                      <p className="mt-1 text-xs text-zinc-600">
                        {t("cancelledOn", {
                          date: new Date(
                            refundCase.resolved_at,
                          ).toLocaleDateString(dateLocale, {
                            dateStyle: "medium",
                          }),
                        })}
                      </p>
                    ) : null}
                    {refundCase.status === "rejected" &&
                    refundCase.escalation_count === 0 ? (
                      <EscalateRefundForm
                        caseId={refundCase.id}
                        orderId={order.id}
                        action={escalateGuestRefundCase}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {canRequestRefundWithinWindow(
              vendor.status as OrderStatus,
              vendor.delivered_at,
            ) && !hasOpenCase ? (
              <GuestRefundRequestForm
                orderId={order.id}
                orderVendorId={vendor.id}
                subtotalMinor={vendor.subtotal_minor}
              />
            ) : null}
            {vendor.status === "delivered" &&
            vendor.delivered_at &&
            !canRequestRefundWithinWindow(
              vendor.status as OrderStatus,
              vendor.delivered_at,
            ) &&
            !hasOpenCase ? (
              <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                {t("returnWindowEnded", {
                  date: refundWindowEndsAt(vendor.delivered_at).toLocaleDateString(
                    dateLocale,
                    { dateStyle: "medium" },
                  ),
                })}
              </p>
            ) : null}
          </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>{t("items")}</span>
          <span className="font-medium text-zinc-900">
            {formatEgp(order.subtotal_minor, moneyLocale)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-zinc-600">
          <span>{t("delivery")}</span>
          <span className="font-medium text-zinc-900">
            {formatEgp(order.delivery_fee_minor, moneyLocale)}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-4">
          <span className="font-medium text-zinc-900">{t("total")}</span>
          <span className="text-lg font-semibold text-zinc-900">
            {formatEgp(order.total_minor, moneyLocale)}
          </span>
        </div>

        <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {t("payCourier")}
        </p>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/shops"
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {tc("continueShopping")}
        </Link>
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          {tc("backToHome")}
        </Link>
      </div>
    </div>
  );
}
