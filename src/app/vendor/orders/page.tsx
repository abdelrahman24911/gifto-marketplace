import Link from "next/link";

import { formatEgp } from "@/lib/money";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/orders";
import { requireVendorRole } from "@/lib/vendor";

import { SuborderActions } from "./suborder-actions";

export const metadata = { title: "Shop orders — Gifto" };

export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access, shops, canManage } = await requireVendorRole(vendor);

  // RLS limits this to the caller's shop; the embedded parent order is
  // readable only because of the "orders: vendor read" policy.
  const { data } = await supabase
    .from("order_vendors")
    .select(
      "id, status, subtotal_minor, created_at, order:orders(id, recipient_name, contact_phone, address_line, city, governorate, notes, created_at), order_items(id, product_name, quantity, unit_price_minor, line_total_minor)",
    )
    .eq("vendor_id", access.vendorId)
    .order("created_at", { ascending: false });

  const suborders = data ?? [];
  const openCount = suborders.filter(
    (s) => s.status !== "delivered" && s.status !== "cancelled",
  ).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {access.vendorName} orders
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {openCount} open {openCount === 1 ? "order" : "orders"} · deliver
            each order line yourself
          </p>
        </div>
        <Link
          href={`/vendor/products?vendor=${access.vendorId}`}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          Manage products
        </Link>
      </div>

      {shops.length > 1 ? (
        <nav aria-label="Switch shop" className="mt-5 flex flex-wrap gap-2">
          {shops.map((shop) => (
            <Link
              key={shop.vendorId}
              href={`/vendor/orders?vendor=${shop.vendorId}`}
              className={`rounded-full border px-3 py-1 text-sm ${
                shop.vendorId === access.vendorId
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {shop.vendorName}
            </Link>
          ))}
        </nav>
      ) : null}

      {!canManage ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are a staff member of this shop, so orders are read-only for you.
          An owner or manager can update them.
        </p>
      ) : null}

      <section className="mt-8">
        {suborders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
            No orders yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {suborders.map((suborder) => {
              const order = suborder.order;
              const status: OrderStatus = isOrderStatus(suborder.status)
                ? suborder.status
                : "placed";

              return (
                <li
                  key={suborder.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-900">
                        Order #{suborder.id.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {new Date(suborder.created_at).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${ORDER_STATUS_STYLES[status]}`}
                    >
                      {ORDER_STATUS_LABELS[status]}
                    </span>
                  </div>

                  {order ? (
                    <div className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm">
                      <p className="font-medium text-zinc-900">
                        {order.recipient_name} · {order.contact_phone}
                      </p>
                      <p className="text-zinc-600">
                        {order.address_line}, {order.city}, {order.governorate}
                      </p>
                      {order.notes ? (
                        <p className="mt-1 text-zinc-500">
                          Notes: {order.notes}
                        </p>
                      ) : null}
                      <p className="mt-1 text-zinc-500">
                        Cash on delivery — collect {formatEgp(suborder.subtotal_minor)}.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-zinc-500">
                      Delivery details are not available.
                    </p>
                  )}

                  <ul className="mt-4 flex flex-col divide-y divide-zinc-100">
                    {(suborder.order_items ?? [])
                      .slice()
                      .sort((a, b) => a.id.localeCompare(b.id))
                      .map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start justify-between gap-4 py-2 text-sm"
                        >
                          <span className="text-zinc-800">
                            {item.product_name}
                            <span className="text-zinc-400">
                              {" "}
                              × {item.quantity}
                            </span>
                          </span>
                          <span className="whitespace-nowrap font-medium text-zinc-900">
                            {formatEgp(item.line_total_minor)}
                          </span>
                        </li>
                      ))}
                  </ul>

                  <p className="mt-2 text-right text-sm text-zinc-600">
                    Subtotal:{" "}
                    <span className="font-medium text-zinc-900">
                      {formatEgp(suborder.subtotal_minor)}
                    </span>
                  </p>

                  {canManage && isOrderStatus(suborder.status) ? (
                    <SuborderActions
                      suborderId={suborder.id}
                      vendorId={access.vendorId}
                      status={suborder.status}
                    />
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
