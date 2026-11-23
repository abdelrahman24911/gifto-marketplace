import Link from "next/link";
import { notFound } from "next/navigation";

import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { formatEgp } from "@/lib/money";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/orders";
import {
  ORDER_STATUS_REASON_LABELS,
  isOrderStatusReasonCode,
} from "@/lib/order-status-reasons";
import { requireVendorRole } from "@/lib/vendor";

import { VendorNotice, VendorPageHeader } from "../../ui";
import { SuborderActions } from "../suborder-actions";

export const metadata = { title: "Order details — Gifto" };

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export default async function VendorOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { id } = await params;
  const { vendor } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const [suborderResult, eventsResult, refundResult] = await Promise.all([
    supabase
      .from("order_vendors")
      .select(
        "id, status, subtotal_minor, delivery_fee_minor, commission_rate, confirmed_at, shipped_at, delivered_at, cancelled_at, courier_name, tracking_ref, handed_over_at, created_at, order:orders(id, public_reference, recipient_name, contact_phone, contact_email, address_line, city, governorate, notes, gift_wrap, gift_message, preferred_delivery_date, delivery_time_note, created_at), order_items(id, product_id, product_name, product_slug, quantity, unit_price_minor, line_total_minor), commission_entries(amount_minor, status)",
      )
      .eq("id", id)
      .eq("vendor_id", access.vendorId)
      .maybeSingle(),
    supabase
      .from("order_status_events")
      .select(
        "id, from_status, to_status, actor_role, reason_code, note, created_at",
      )
      .eq("order_vendor_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("refund_cases")
      .select("id, status, created_at")
      .eq("order_vendor_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (suborderResult.error) {
    return (
      <div className="w-full">
        <VendorPageHeader
          eyebrow="Order desk"
          title="Order details"
          description="This shop line could not be loaded."
        />
        <div className="mt-4">
          <VendorNotice tone="danger" role="alert">
            This order could not be loaded. Return to the order list and try
            again.
          </VendorNotice>
        </div>
        <Link
          href={`/vendor/orders?vendor=${access.vendorId}`}
          className="mt-4 inline-block text-sm font-medium text-berry hover:text-berry-deep"
        >
          ← Back to orders
        </Link>
      </div>
    );
  }

  const suborder = suborderResult.data;
  if (!suborder) notFound();

  const order = suborder.order;
  const status: OrderStatus = isOrderStatus(suborder.status)
    ? suborder.status
    : "placed";
  const items = (suborder.order_items ?? [])
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const events = eventsResult.data ?? [];
  const refundCase = (refundResult.data ?? [])[0] ?? null;
  const commission = suborder.commission_entries;
  const reference = order?.public_reference ?? `#${suborder.id.slice(0, 8)}`;

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Order desk"
        title={reference}
        description={
          <>
            Placed {formatDateTime(suborder.created_at)}
            {order ? ` · for ${order.recipient_name}` : ""} · cash on
            delivery
          </>
        }
        actions={
          <Link
            href={`/vendor/orders?vendor=${access.vendorId}`}
            className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
          >
            ← Back to orders
          </Link>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${ORDER_STATUS_STYLES[status]}`}
        >
          {ORDER_STATUS_LABELS[status]}
        </span>
        {suborder.courier_name ? (
          <span className="text-sm text-ink-mute">
            Shipped via {suborder.courier_name}
            {suborder.tracking_ref ? ` · ${suborder.tracking_ref}` : ""}
            {suborder.handed_over_at
              ? ` · handed over ${formatDateTime(suborder.handed_over_at)}`
              : ""}
          </span>
        ) : null}
      </div>

      {refundCase ? (
        <div className="mt-4">
          <VendorNotice tone="info">
            This shop line has a refund case (
            {refundCase.status.replaceAll("_", " ")}).{" "}
            <Link
              href={`/vendor/refunds/${refundCase.id}?vendor=${access.vendorId}`}
              className="font-medium text-berry hover:text-berry-deep"
            >
              Open the refund case →
            </Link>
          </VendorNotice>
        </div>
      ) : null}

      {!canManage ? (
        <div className="mt-4">
          <VendorNotice tone="info">
            Staff access is read-only for orders. Owners and managers can
            update shop-line status.
          </VendorNotice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-paper-soft px-4 py-4 sm:px-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            Deliver to
          </p>
          {order ? (
            <div className="mt-2 text-sm leading-relaxed">
              <p className="font-medium text-ink">{order.recipient_name}</p>
              <p className="text-ink-soft">{order.contact_phone}</p>
              {order.contact_email ? (
                <p className="text-ink-soft">{order.contact_email}</p>
              ) : null}
              <p className="mt-1 text-ink-soft">
                {order.address_line}
                <br />
                {order.city}, {order.governorate}
              </p>
              {order.notes ? (
                <p className="mt-2 rounded-lg bg-paper-deep/70 px-3 py-2 text-xs text-ink-soft">
                  Customer note: {order.notes}
                </p>
              ) : null}
              {order.gift_wrap || order.gift_message ? (
                <p className="mt-2 rounded-lg border border-berry-tint bg-berry-soft px-3 py-2 text-xs text-berry-deep">
                  Gift wrap requested
                  {order.gift_message ? ` — “${order.gift_message}”` : ""}
                </p>
              ) : null}
              {order.preferred_delivery_date ? (
                <p className="mt-2 text-xs text-ink-mute">
                  Preferred delivery day: {order.preferred_delivery_date}
                  {order.delivery_time_note
                    ? ` · ${order.delivery_time_note}`
                    : ""}
                </p>
              ) : order.delivery_time_note ? (
                <p className="mt-2 text-xs text-ink-mute">
                  Preferred delivery time: {order.delivery_time_note}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-ink-mute">
                Cash on delivery — collect {formatEgp(suborder.subtotal_minor)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-mute">
              Delivery details are not available.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-paper-soft px-4 py-4 sm:px-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            This shop&apos;s items
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-4 py-2 text-sm"
              >
                <span className="text-ink">
                  {item.product_name}
                  <span className="text-ink-mute"> × {item.quantity}</span>
                </span>
                <span className="whitespace-nowrap font-medium text-ink">
                  {formatEgp(item.line_total_minor)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="font-medium text-ink-soft">Shop subtotal</span>
            <span className="font-display text-xl tabular-nums text-ink">
              {formatEgp(suborder.subtotal_minor)}
            </span>
          </div>
          {commission ? (
            <p className="mt-2 text-xs text-ink-mute">
              Gifto commission {formatEgp(commission.amount_minor)} ·{" "}
              {commission.status === "reversed"
                ? "reversed (this line was returned)"
                : "earned on delivery"}
            </p>
          ) : null}
        </section>
      </div>

      {canManage && isOrderStatus(suborder.status) ? (
        <section className="mt-4 rounded-2xl border border-line bg-paper px-4 py-4 sm:px-5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            Update this shop line
          </p>
          <div className="mt-3">
            <SuborderActions
              suborderId={suborder.id}
              vendorId={access.vendorId}
              status={suborder.status}
            />
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-line bg-paper-soft px-4 py-4 sm:px-5">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
          History
        </p>
        {eventsResult.error ? (
          <p className="mt-2 text-sm text-ink-mute">
            The history for this shop line could not be loaded.
          </p>
        ) : events.length === 0 ? (
          <p className="mt-2 text-sm text-ink-mute">
            No status changes recorded yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {events.map((event) => {
              const fromLabel = event.from_status
                ? (ORDER_STATUS_LABELS[
                    event.from_status as OrderStatus
                  ] ?? event.from_status)
                : "Placed";
              const toLabel =
                ORDER_STATUS_LABELS[event.to_status as OrderStatus] ??
                event.to_status;
              const reasonLabel = event.reason_code
                ? isOrderStatusReasonCode(event.reason_code)
                  ? ORDER_STATUS_REASON_LABELS[event.reason_code]
                  : event.reason_code
                : null;
              return (
                <li key={event.id} className="text-sm leading-relaxed">
                  <p className="font-medium text-ink">
                    {fromLabel} → {toLabel}
                  </p>
                  <p className="text-xs text-ink-mute">
                    {formatDateTime(event.created_at)}
                    {event.actor_role ? ` · ${event.actor_role}` : ""}
                    {reasonLabel ? ` · ${reasonLabel}` : ""}
                  </p>
                  {event.note ? (
                    <p className="mt-1 text-xs text-ink-soft">{event.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
