import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatEgp } from "@/lib/money";
import {
  ADDRESS_CORRECTION_REASONS,
  type AddressCorrectionValues,
} from "@/lib/order-address";
import {
  ORDER_STATUS_REASON_LABELS,
  isOrderStatusReasonCode,
} from "@/lib/order-status-reasons";
import { ORDER_STATUS_LABELS, isOrderStatus } from "@/lib/orders";

import {
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../../ui";
import { AdminAddressCorrection } from "../address-correction";
import {
  ADMIN_ORDER_STATUS_STYLES,
  formatOrderDateTime,
} from "../order-shared";
import { AdminSuborderActions } from "../suborder-actions";

import type { OrderStatus, OrderStatusActorRole } from "@/lib/supabase/database.types";

export const metadata = { title: "Order details - Admin - Gifto" };

const ACTOR_ROLE_LABELS: Record<OrderStatusActorRole, string> = {
  customer: "Customer",
  vendor: "Shop",
  admin: "Platform admin",
  system: "System",
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();

  const [orderResult, eventsResult, correctionsResult, consentResult] =
    await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, public_reference, user_id, status, subtotal_minor, delivery_fee_minor, total_minor, recipient_name, contact_phone, contact_email, address_line, city, governorate, notes, gift_wrap, gift_message, preferred_delivery_date, delivery_time_note, created_at, updated_at, order_vendors(id, status, subtotal_minor, delivery_fee_minor, commission_rate, confirmed_at, shipped_at, delivered_at, cancelled_at, courier_name, tracking_ref, handed_over_at, created_at, vendor:vendors(name, slug), order_items(id, product_id, product_name, product_slug, quantity, unit_price_minor, line_total_minor), commission_entries(amount_minor, status))",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("order_status_events")
        .select(
          "id, order_vendor_id, from_status, to_status, actor_id, actor_role, reason_code, note, created_at",
        )
        .eq("order_id", id)
        .order("created_at", { ascending: true }),
      // P1-13: address-correction audit (own table, not status events).
      supabase
        .from("order_address_corrections")
        .select(
          "id, actor_id, reason_code, note, before, after, coverage_warning_acknowledged, created_at",
        )
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
      // Migration 62: price-consent audit (one row per order).
      supabase
        .from("price_consent_events")
        .select(
          "id, user_id, guest_token_hash, expected_prices, expected_total_minor, live_total_minor, created_at",
        )
        .eq("order_id", id)
        .maybeSingle(),
    ]);

  if (orderResult.error) {
    return (
      <div className="w-full">
        <Breadcrumb
          items={[
            { href: "/admin", label: "Administration" },
            { href: "/admin/orders", label: "Orders" },
            { label: "Order details" },
          ]}
        />
        <div className="mt-4">
          <AdminNotice tone="danger" role="alert">
            This order could not be loaded. Return to the order list and try
            again.
          </AdminNotice>
        </div>
      </div>
    );
  }

  const order = orderResult.data;
  if (!order) notFound();

  const status: OrderStatus = isOrderStatus(order.status)
    ? order.status
    : "placed";
  const suborders = order.order_vendors ?? [];
  const events = eventsResult.data ?? [];
  const corrections = correctionsResult.data ?? [];
  const consent = consentResult.data ?? null;
  const reference = order.public_reference ?? `#${order.id.slice(0, 8)}`;
  // P1-13: correction is allowed only while no shop line has been
  // delivered or returned; the RPC enforces the same guard.
  const canCorrectAddress = !suborders.some((suborder) =>
    ["delivered", "returned"].includes(suborder.status ?? ""),
  );
  const addressValues: AddressCorrectionValues = {
    recipientName: order.recipient_name,
    contactPhone: order.contact_phone,
    addressLine: order.address_line,
    city: order.city,
    governorate: order.governorate,
    reasonCode: "",
    note: "",
  };

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { href: "/admin/orders", label: "Orders" },
          { label: reference },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Order detail"
          title={reference}
          description={`Placed ${formatOrderDateTime(order.created_at)} (Cairo time).`}
          actions={
            <Link
              href="/admin/orders"
              className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
            >
              Back to orders
            </Link>
          }
        />
      </div>

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Order status",
              value: ORDER_STATUS_LABELS[status],
              hint: `${suborders.length} ${suborders.length === 1 ? "shop" : "shops"}`,
              emphasis:
                status === "cancelled" || status === "returned"
                  ? "warning"
                  : "accent",
            },
            {
              label: "Order total",
              value: formatEgp(order.total_minor),
              hint: "Cash on delivery",
            },
            {
              label: "Products",
              value: formatEgp(order.subtotal_minor),
              hint: `Delivery ${formatEgp(order.delivery_fee_minor)}`,
            },
            {
              label: "Customer",
              value: order.user_id === null ? "Guest" : "Account",
              hint: order.contact_phone,
            },
          ]}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          {suborders.map((suborder) => {
            const subStatus: OrderStatus = isOrderStatus(suborder.status)
              ? suborder.status
              : "placed";
            const commission = suborder.commission_entries;
            const suborderEvents = events.filter(
              (event) => event.order_vendor_id === suborder.id,
            );

            return (
              <section
                key={suborder.id}
                className="rounded-2xl border border-line bg-paper-soft p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                      Shop suborder
                    </p>
                    <h2 className="mt-1 font-display text-xl text-ink">
                      {suborder.vendor?.name ?? "Unknown shop"}
                    </h2>
                    <p className="mt-1 text-xs text-ink-mute">
                      {suborder.order_items?.length ?? 0}{" "}
                      {(suborder.order_items?.length ?? 0) === 1
                        ? "product"
                        : "products"}{" "}
                      � {formatEgp(suborder.subtotal_minor)}
                    </p>
                    {suborder.courier_name ? (
                      <p className="mt-1 text-xs text-ink-mute">
                        Shipped via {suborder.courier_name}
                        {suborder.tracking_ref
                          ? ` · ${suborder.tracking_ref}`
                          : ""}
                        {suborder.handed_over_at
                          ? ` · handed over ${formatOrderDateTime(suborder.handed_over_at)}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide ${ADMIN_ORDER_STATUS_STYLES[subStatus]}`}
                  >
                    {ORDER_STATUS_LABELS[subStatus]}
                  </span>
                </div>

                <div className="mt-4 rounded-xl border border-line bg-paper p-4">
                  <AdminSuborderActions
                    suborderId={suborder.id}
                    orderId={order.id}
                    status={subStatus}
                  />
                </div>

                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-ink">Products</h3>
                  <ul className="mt-2 flex flex-col divide-y divide-line">
                    {(suborder.order_items ?? []).map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm"
                      >
                        <span className="text-ink">
                          {item.product_name}
                          <span className="text-ink-mute">
                            {" "}
                            � {item.quantity} � {formatEgp(item.unit_price_minor)}
                          </span>
                        </span>
                        <span className="tabular-nums text-ink">
                          {formatEgp(item.line_total_minor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-sm">
                    <span className="text-ink-mute">
                      Commission{" "}
                      <span className="font-medium text-ink">
                        {commission ? formatEgp(commission.amount_minor) : "not earned"}
                      </span>
                      {commission?.status === "reversed" ? (
                        <span className="ml-1 text-danger">(reversed)</span>
                      ) : null}
                    </span>
                    <span className="text-ink-mute">
                      Subtotal{" "}
                      <span className="font-medium tabular-nums text-ink">
                        {formatEgp(suborder.subtotal_minor)}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-ink">
                    Status history
                  </h3>
                  {suborderEvents.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-mute">
                      No status changes recorded yet.
                    </p>
                  ) : (
                    <ol className="mt-3 flex flex-col gap-3">
                      {suborderEvents.map((event) => {
                        const role: OrderStatusActorRole =
                          event.actor_role === "customer" ||
                          event.actor_role === "vendor" ||
                          event.actor_role === "admin" ||
                          event.actor_role === "system"
                            ? event.actor_role
                            : "system";
                        const reason =
                          event.reason_code &&
                          isOrderStatusReasonCode(event.reason_code)
                            ? ORDER_STATUS_REASON_LABELS[event.reason_code]
                            : event.reason_code;

                        return (
                          <li
                            key={event.id}
                            className="rounded-xl border border-line bg-paper px-4 py-3 text-sm"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="font-medium text-ink">
                                {ORDER_STATUS_LABELS[
                                  isOrderStatus(event.from_status)
                                    ? event.from_status
                                    : "placed"
                                ]}{" "}
                                →{" "}
                                {ORDER_STATUS_LABELS[
                                  isOrderStatus(event.to_status)
                                    ? event.to_status
                                    : "placed"
                                ]}
                              </p>
                              <time
                                dateTime={event.created_at}
                                className="text-xs text-ink-mute"
                              >
                                {formatOrderDateTime(event.created_at)}
                              </time>
                            </div>
                            <p className="mt-1 text-xs text-ink-mute">
                              By {ACTOR_ROLE_LABELS[role]}
                              {event.actor_id
                                ? ` (${event.actor_id.slice(0, 8)})`
                                : ""}
                              {reason ? ` � ${reason}` : ""}
                            </p>
                            {event.note ? (
                              <p className="mt-2 rounded-lg bg-paper-deep px-3 py-2 text-xs text-ink-soft">
                                {event.note}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </section>
            );
          })}

          {suborders.length === 0 ? (
            <EmptyState title="This order has no shop suborders">
              The order record exists but no vendor lines were found.
            </EmptyState>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-2xl border border-line bg-paper-soft p-5">
            <h2 className="text-sm font-semibold text-ink">Customer & delivery</h2>
            <dl className="mt-3 flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-mute">
                  Recipient
                </dt>
                <dd className="mt-0.5 text-ink">{order.recipient_name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-mute">
                  Phone
                </dt>
                <dd className="mt-0.5 text-ink">{order.contact_phone}</dd>
              </div>
              {order.contact_email ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-mute">
                    Email
                  </dt>
                  <dd className="mt-0.5 break-all text-ink">
                    {order.contact_email}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-mute">
                  Address
                </dt>
                <dd className="mt-0.5 text-ink">{order.address_line}</dd>
                <dd className="text-ink">
                  {order.city}, {order.governorate}
                </dd>
              </div>
              {order.notes ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-mute">
                    Customer note
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap rounded-lg bg-paper px-3 py-2 text-ink-soft">
                    {order.notes}
                  </dd>
                </div>
              ) : null}
              {order.gift_wrap || order.gift_message ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-mute">
                    Gift
                  </dt>
                  <dd className="mt-0.5 text-ink">
                    {order.gift_wrap ? "Gift wrap requested" : "No wrap"}
                    {order.gift_message ? ` — “${order.gift_message}”` : ""}
                  </dd>
                </div>
              ) : null}
              {order.preferred_delivery_date ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-mute">
                    Preferred delivery day
                  </dt>
                  <dd className="mt-0.5 text-ink">
                    {order.preferred_delivery_date}
                    {order.delivery_time_note
                      ? ` · ${order.delivery_time_note}`
                      : ""}
                  </dd>
                </div>
              ) : order.delivery_time_note ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-mute">
                    Preferred delivery time
                  </dt>
                  <dd className="mt-0.5 text-ink">
                    {order.delivery_time_note}
                  </dd>
                </div>
              ) : null}
            </dl>

            <AdminAddressCorrection
              orderId={order.id}
              current={addressValues}
              canCorrect={canCorrectAddress}
            />

            {corrections.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-ink">
                  Address corrections
                </h3>
                <ol className="mt-2 flex flex-col gap-2">
                  {corrections.map((correction) => {
                    const before =
                      correction.before &&
                      typeof correction.before === "object" &&
                      !Array.isArray(correction.before)
                        ? (correction.before as Record<string, unknown>)
                        : {};
                    const after =
                      correction.after &&
                      typeof correction.after === "object" &&
                      !Array.isArray(correction.after)
                        ? (correction.after as Record<string, unknown>)
                        : {};
                    const changed = (
                      [
                        ["recipient_name", "Recipient"],
                        ["contact_phone", "Phone"],
                        ["address_line", "Address"],
                        ["city", "City"],
                        ["governorate", "Governorate"],
                      ] as const
                    ).filter(
                      ([key]) =>
                        String(before[key] ?? "") !== String(after[key] ?? ""),
                    );
                    const reason =
                      correction.reason_code in ADDRESS_CORRECTION_REASONS
                        ? ADDRESS_CORRECTION_REASONS[
                            correction.reason_code as keyof typeof ADDRESS_CORRECTION_REASONS
                          ]
                        : correction.reason_code;

                    return (
                      <li
                        key={correction.id}
                        className="rounded-xl border border-line bg-paper px-4 py-3 text-sm"
                      >
                        <p className="font-medium text-ink">{reason}</p>
                        <p className="mt-0.5 text-xs text-ink-mute">
                          {formatOrderDateTime(correction.created_at)}
                          {correction.actor_id
                            ? ` · by admin (${correction.actor_id.slice(0, 8)})`
                            : ""}
                          {correction.coverage_warning_acknowledged
                            ? " · coverage warning acknowledged"
                            : ""}
                        </p>
                        {changed.map(([key, label]) => (
                          <p key={key} className="mt-1 text-xs text-ink-soft">
                            {label}: {String(before[key] ?? "—")} →{" "}
                            {String(after[key] ?? "—")}
                          </p>
                        ))}
                        {correction.note ? (
                          <p className="mt-2 rounded-lg bg-paper-deep px-3 py-2 text-xs text-ink-soft">
                            {correction.note}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}

            {consent ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-ink">
                  Price consent
                </h3>
                <div className="mt-2 rounded-xl border border-line bg-paper px-4 py-3 text-sm">
                  <p className="text-ink">
                    {consent.user_id
                      ? "Signed-in customer"
                      : "Guest checkout"}{" "}
                    agreed to the prices shown at checkout on{" "}
                    {formatOrderDateTime(consent.created_at)}.
                  </p>
                  <p className="mt-1 text-xs text-ink-mute">
                    Expected total {formatEgp(consent.expected_total_minor)} ·{" "}
                    charged total {formatEgp(consent.live_total_minor)}
                    {consent.expected_total_minor ===
                    consent.live_total_minor
                      ? " · prices matched"
                      : " · PRICES DIFFER — investigate"}
                  </p>
                  {Array.isArray(consent.expected_prices) ? (
                    <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
                      {(
                        consent.expected_prices as {
                          product_id?: unknown;
                          unit_price_minor?: unknown;
                        }[]
                      ).map((line) => {
                        const productId =
                          typeof line.product_id === "string"
                            ? line.product_id
                            : "";
                        const item = suborders
                          .flatMap((s) => s.order_items ?? [])
                          .find((i) => i.product_id === productId);
                        return (
                          <li key={productId || "unknown"}>
                            {item?.product_name ??
                              `Product ${productId.slice(0, 8)}`}
                            : expected{" "}
                            {typeof line.unit_price_minor === "number"
                              ? formatEgp(line.unit_price_minor)
                              : "—"}
                            {item
                              ? ` · charged ${formatEgp(item.unit_price_minor)}`
                              : ""}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-line bg-paper-soft p-5">
            <h2 className="text-sm font-semibold text-ink">Order timeline</h2>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-mute">Placed</dt>
                <dd className="text-right text-ink">
                  {formatOrderDateTime(order.created_at)}
                </dd>
              </div>
              {suborders.map((suborder) => (
                <div key={suborder.id} className="flex justify-between gap-3">
                  <dt className="min-w-0 truncate text-ink-mute">
                    {suborder.vendor?.name ?? "Shop"}
                  </dt>
                  <dd className="text-right text-ink">
                    {ORDER_STATUS_LABELS[
                      isOrderStatus(suborder.status)
                        ? suborder.status
                        : "placed"
                    ]}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-mute">
              All times shown in Cairo business time.
            </p>
          </section>

          {eventsResult.error ? (
            <AdminNotice tone="danger" role="alert">
              Status history could not be loaded.
            </AdminNotice>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
