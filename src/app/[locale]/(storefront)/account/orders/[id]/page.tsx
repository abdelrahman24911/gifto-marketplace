import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localePrefixFor } from "@/lib/locale-path";
import { pageMetadata } from "@/lib/metadata";
import type { AppLocale } from "@/i18n/routing";
import type { MoneyLocale } from "@/lib/money";

import { requireUser } from "@/lib/auth";
import { scopeOrdersToUser } from "@/lib/account-orders";
import { formatEgp } from "@/lib/money";
import { loadOrderVendorProfiles } from "@/lib/order-vendors.server";
import { ORDER_STATUS_STYLES, isOrderStatus } from "@/lib/orders";
import {
  REFUND_CASE_STATUS_STYLES,
  canRequestRefundWithinWindow,
  refundWindowEndsAt,
  type RefundReturnPath,
} from "@/lib/refunds";
import { EscalateRefundForm } from "@/components/escalate-refund-form";

import { CancelOrderButton } from "./cancel-order-button";
import { RefundRequestForm } from "./refund-request-form";
import { escalateRefundCase } from "./refund-actions";

import type {
  OrderStatus,
  RefundCaseStatus,
} from "@/lib/supabase/database.types";

type RefundCaseRow = {
  id: string;
  order_vendor_id: string;
  status: RefundCaseStatus;
  reason: string;
  requested_amount_minor: number | null;
  refund_amount_minor: number | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  return_path: RefundReturnPath | null;
  received_at: string | null;
  restocked_at: string | null;
  escalation_count: number;
  escalated_at: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const ta = await getTranslations("account");
  const { id } = await params;
  return {
    ...pageMetadata({
      title: `${ta("orderNumber", { id: id.slice(0, 8) })} — Gifto`,
      description: ta("orderNumber", { id: id.slice(0, 8) }),
      path: `${localePrefixFor(locale)}/account/orders/${id}`,
      noIndex: true,
    }),
    robots: { index: false, follow: false },
  };
}

function badge(status: string, labels: Record<OrderStatus, string>) {
  const key = isOrderStatus(status) ? status : "placed";
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${ORDER_STATUS_STYLES[key]}`}
    >
      {labels[key]}
    </span>
  );
}

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("order");
  const ta = await getTranslations("account");
  const tc = await getTranslations("common");
  const tp = await getTranslations("product");
  const tcart = await getTranslations("cart");
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
  const returnPathLabels: Record<RefundReturnPath, string> = {
    physical_return: t("returnPhysical"),
    no_return: t("returnNoReturn"),
  };

  const { id } = await params;
  const { supabase, user } = await requireUser();

  // RLS remains a second boundary; this explicit filter prevents platform
  // admin privileges from broadening the customer-facing page.
  const { data: order, error } = await scopeOrdersToUser(
    supabase
    .from("orders")
    .select(
      "id, status, payment_method, subtotal_minor, delivery_fee_minor, total_minor, recipient_name, contact_phone, address_line, city, governorate, notes, created_at, order_vendors(id, status, subtotal_minor, vendor_id, delivered_at, courier_name, tracking_ref, handed_over_at, order_items(id, product_name, product_slug, unit_price_minor, quantity, line_total_minor))",
    )
    .eq("id", id)
    ,
    user.id,
  )
    .maybeSingle();

  if (error) {
    throw new Error("Your order could not be loaded.");
  }
  if (!order) notFound();

  const suborders = order.order_vendors ?? [];
  const vendorProfiles = await loadOrderVendorProfiles(suborders);
  const canCancel = order.status === "placed";

  const { data: refundCases, error: refundError } = await supabase
    .from("refund_cases")
    .select(
      "id, order_vendor_id, status, reason, requested_amount_minor, refund_amount_minor, resolution_note, created_at, resolved_at, return_path, received_at, restocked_at, escalation_count, escalated_at",
    )
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .returns<RefundCaseRow[]>();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <nav aria-label={tc("breadcrumb")} className="text-sm text-zinc-500">
        <Link href="/account/orders" className="underline hover:text-zinc-800">
          {ta("yourOrders")}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-800">#{order.id.slice(0, 8)}</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {ta("orderNumber", { id: order.id.slice(0, 8) })}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t("placedOn", {
              date: new Date(order.created_at).toLocaleString(dateLocale, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        </div>
        {badge(order.status, statusLabels)}
      </div>

      <p className="mt-2 text-sm text-zinc-600">
        {isOrderStatus(order.status) ? statusHelp[order.status] : null}
      </p>

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
        {suborders.map((suborder) => {
          const items = suborder.order_items ?? [];
          const vendor = vendorProfiles.get(suborder.vendor_id) ?? null;
          const suborderCases = (refundCases ?? []).filter(
            (refundCase) => refundCase.order_vendor_id === suborder.id,
          );
          const hasOpenCase = suborderCases.some(
            (refundCase) => refundCase.status === "open",
          );

          return (
            <div
              key={suborder.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {vendor ? (
                    <Link
                      href={`/shops/${vendor.slug}`}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                    >
                      {vendor.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-zinc-900">{tp("shopLabel")}</span>
                  )}
                  <p className="mt-1 text-sm text-zinc-500">
                    {tcart("deliveryFromShop")}
                  </p>
                </div>
                {badge(suborder.status, statusLabels)}
              </div>

              {suborder.courier_name ? (
                <p className="mt-2 text-sm text-zinc-600">
                  Shipped via {suborder.courier_name}
                  {suborder.tracking_ref ? ` · ${suborder.tracking_ref}` : ""}
                  {suborder.handed_over_at
                    ? ` · handed over ${new Date(suborder.handed_over_at).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" })}`
                    : ""}
                </p>
              ) : null}

              <p className="mt-2 text-sm text-zinc-600">
                {isOrderStatus(suborder.status)
                  ? statusHelp[suborder.status]
                  : null}
              </p>

              <ul className="mt-4 flex flex-col divide-y divide-zinc-100">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      {vendor ? (
                        <Link
                          href={`/shops/${vendor.slug}/${item.product_slug}`}
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {item.product_name}
                        </Link>
                      ) : (
                        <span className="font-medium text-zinc-900">
                          {item.product_name}
                        </span>
                      )}
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
                  {formatEgp(suborder.subtotal_minor, moneyLocale)}
                </span>
              </p>

              {suborderCases.length > 0 ? (
                <div className="mt-4 flex flex-col gap-2 border-t border-zinc-100 pt-4">
                  {suborderCases.map((refundCase) => (
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
                      {refundCase.status === "approved" &&
                      refundCase.return_path ? (
                        <p className="mt-1 text-xs text-zinc-600">
                          {returnPathLabels[refundCase.return_path]}
                          {refundCase.received_at
                            ? ` · ${t("returnReceived")}`
                            : null}
                          {refundCase.restocked_at
                            ? ` · ${t("returnRestocked")}`
                            : null}
                        </p>
                      ) : null}
                      {refundCase.status === "open" &&
                      refundCase.escalation_count > 0 ? (
                        <p className="mt-1 text-xs font-medium text-zinc-700">
                          {t("escalated")}
                        </p>
                      ) : null}
                      {refundCase.status === "rejected" &&
                      refundCase.escalation_count === 0 ? (
                        <EscalateRefundForm
                          caseId={refundCase.id}
                          orderId={order.id}
                          action={escalateRefundCase}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {canRequestRefundWithinWindow(
                suborder.status as OrderStatus,
                suborder.delivered_at,
              ) && !hasOpenCase ? (
                <RefundRequestForm
                  orderId={order.id}
                  orderVendorId={suborder.id}
                  subtotalMinor={suborder.subtotal_minor}
                />
              ) : null}
              {suborder.status === "delivered" &&
              suborder.delivered_at &&
              !canRequestRefundWithinWindow(
                suborder.status as OrderStatus,
                suborder.delivered_at,
              ) &&
              !hasOpenCase ? (
                <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                  {t("returnWindowEnded", {
                    date: refundWindowEndsAt(suborder.delivered_at).toLocaleDateString(
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

        {canCancel ? <CancelOrderButton orderId={order.id} /> : null}
      </section>
    </div>
  );
}
