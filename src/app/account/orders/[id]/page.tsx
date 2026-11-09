import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { scopeOrdersToUser } from "@/lib/account-orders";
import { formatEgp } from "@/lib/money";
import { loadOrderVendorProfiles } from "@/lib/order-vendors.server";
import {
  ORDER_STATUS_HELP,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  isOrderStatus,
} from "@/lib/orders";

import { CancelOrderButton } from "./cancel-order-button";

export const metadata = { title: "Order — Gifto" };

function badge(status: string) {
  const key = isOrderStatus(status) ? status : "placed";
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${ORDER_STATUS_STYLES[key]}`}
    >
      {ORDER_STATUS_LABELS[key]}
    </span>
  );
}

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  // RLS remains a second boundary; this explicit filter prevents platform
  // admin privileges from broadening the customer-facing page.
  const { data: order, error } = await scopeOrdersToUser(
    supabase
    .from("orders")
    .select(
      "id, status, payment_method, subtotal_minor, delivery_fee_minor, total_minor, recipient_name, contact_phone, address_line, city, governorate, notes, created_at, order_vendors(id, status, subtotal_minor, vendor_id, order_items(id, product_name, product_slug, unit_price_minor, quantity, line_total_minor))",
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <Link href="/account/orders" className="underline hover:text-zinc-800">
          Your orders
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-800">#{order.id.slice(0, 8)}</span>
      </nav>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Order #{order.id.slice(0, 8)}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Placed{" "}
            {new Date(order.created_at).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · cash on delivery
          </p>
        </div>
        {badge(order.status)}
      </div>

      <p className="mt-2 text-sm text-zinc-600">
        {isOrderStatus(order.status) ? ORDER_STATUS_HELP[order.status] : null}
      </p>

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

      <section className="mt-6 flex flex-col gap-4">
        {suborders.map((suborder) => {
          const items = suborder.order_items ?? [];
          const vendor = vendorProfiles.get(suborder.vendor_id) ?? null;

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
                    <span className="font-medium text-zinc-900">Shop</span>
                  )}
                  <p className="mt-1 text-sm text-zinc-500">
                    Delivery from this shop: free
                  </p>
                </div>
                {badge(suborder.status)}
              </div>

              <p className="mt-2 text-sm text-zinc-600">
                {isOrderStatus(suborder.status)
                  ? ORDER_STATUS_HELP[suborder.status]
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
                  {formatEgp(suborder.subtotal_minor)}
                </span>
              </p>
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

        {canCancel ? <CancelOrderButton orderId={order.id} /> : null}
      </section>
    </div>
  );
}
