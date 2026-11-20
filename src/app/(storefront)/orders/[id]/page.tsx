import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import {
  guestCookieName,
  isValidGuestToken,
  sha256Hex,
} from "@/lib/guest-order";
import { formatEgp } from "@/lib/money";
import { ORDER_STATUS_HELP, ORDER_STATUS_LABELS, isOrderStatus } from "@/lib/orders";
import {
  REFUND_CASE_STATUS_LABELS,
  REFUND_CASE_STATUS_STYLES,
  canRequestRefund,
} from "@/lib/refunds";
import { createServiceClient } from "@/lib/supabase/service";

import { GuestRefundRequestForm } from "./refund-request-form";
import { GuestCancelOrderButton } from "./cancel-order-form";

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
};

export const metadata = {
  title: "Order confirmed — Gifto",
  robots: { index: false, follow: false },
};

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

  if (error || !isGuestOrder(data)) notFound();

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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      {status === "cancelled" ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Order cancelled
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Reference {reference} · stock was returned to the shops.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-900">
            Order confirmed
          </h1>
          <p className="mt-1 text-sm text-emerald-800">
            Reference {reference} · cash on delivery
          </p>
        </div>
      )}

      <p className="mt-4 text-sm text-zinc-600">
        {ORDER_STATUS_HELP[status]} A copy of this confirmation stays available
        in this browser; keep the reference above for your records.
      </p>

      {status === "placed" ? (
        <GuestCancelOrderButton orderId={order.id} />
      ) : null}

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Delivery details
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Recipient</dt>
            <dd className="text-zinc-900">{order.recipient_name}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Phone</dt>
            <dd className="text-zinc-900">{order.contact_phone}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Address</dt>
            <dd className="text-zinc-900">
              {order.address_line}, {order.city}, {order.governorate}
            </dd>
          </div>
          {order.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Notes</dt>
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
          Refund requests could not be loaded. Refresh the page to try again.
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
                  {ORDER_STATUS_LABELS[vendor.status]}
                </span>
              ) : null}
            </div>

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
                      {formatEgp(item.unit_price_minor)} × {item.quantity}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-medium text-zinc-900">
                    {formatEgp(item.line_total_minor)}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-2 text-right text-sm text-zinc-600">
              Shop subtotal:{" "}
              <span className="font-medium text-zinc-900">
                {formatEgp(vendor.subtotal_minor)}
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
                        Refund {REFUND_CASE_STATUS_LABELS[refundCase.status]}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {new Date(refundCase.created_at).toLocaleDateString(
                          "en-GB",
                          { dateStyle: "medium" },
                        )}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-zinc-700">
                      {refundCase.reason}
                    </p>
                    {refundCase.refund_amount_minor !== null ? (
                      <p className="mt-1 text-xs font-medium text-zinc-700">
                        Approved amount:{" "}
                        {formatEgp(refundCase.refund_amount_minor)}
                      </p>
                    ) : null}
                    {refundCase.resolution_note ? (
                      <p className="mt-1 text-xs text-zinc-600">
                        Gifto note: {refundCase.resolution_note}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {canRequestRefund(vendor.status as OrderStatus) && !hasOpenCase ? (
              <GuestRefundRequestForm
                orderId={order.id}
                orderVendorId={vendor.id}
                subtotalMinor={vendor.subtotal_minor}
              />
            ) : null}
          </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>Items</span>
          <span className="font-medium text-zinc-900">
            {formatEgp(order.subtotal_minor)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm text-zinc-600">
          <span>Delivery</span>
          <span className="font-medium text-zinc-900">
            {formatEgp(order.delivery_fee_minor)}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-4">
          <span className="font-medium text-zinc-900">Total</span>
          <span className="text-lg font-semibold text-zinc-900">
            {formatEgp(order.total_minor)}
          </span>
        </div>

        <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Pay the courier in cash when your order arrives. Each shop delivers
          its own items, so a multi-shop order may arrive in more than one
          delivery.
        </p>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/shops"
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Continue shopping
        </Link>
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
