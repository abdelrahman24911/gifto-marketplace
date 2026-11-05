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

const FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "placed", label: "Placed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
  { value: "partially_completed", label: "Partially completed" },
] as const;

export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; status?: string }>;
}) {
  const { vendor, status: statusFilter } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  // RLS limits this to the caller's shop; the embedded parent order is
  // readable only because of the "orders: vendor read" policy.
  const { data } = await supabase
    .from("order_vendors")
    .select(
      "id, status, subtotal_minor, created_at, order:orders(id, public_reference, recipient_name, contact_phone, address_line, city, governorate, notes, created_at), order_items(id, product_name, quantity, unit_price_minor, line_total_minor)",
    )
    .eq("vendor_id", access.vendorId)
    .order("created_at", { ascending: false });

  let suborders = data ?? [];
  const filter = statusFilter ?? "all";

  if (filter === "open") {
    suborders = suborders.filter(
      (s) => s.status !== "delivered" && s.status !== "cancelled" && s.status !== "returned",
    );
  } else if (filter !== "all" && isOrderStatus(filter)) {
    suborders = suborders.filter((s) => s.status === filter);
  }

  const openCount = (data ?? []).filter(
    (s) => s.status !== "delivered" && s.status !== "cancelled" && s.status !== "returned",
  ).length;

  return (
    <div className="w-full">
      <div>
        <h1 className="font-display text-2xl text-ink">Orders</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {openCount} open {openCount === 1 ? "order" : "orders"} · deliver each
          order line yourself
        </p>
      </div>

      {!canManage ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are a staff member of this shop, so orders are read-only for you.
          An owner or manager can update them.
        </p>
      ) : null}

      <nav aria-label="Filter orders" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const href = `/vendor/orders?vendor=${access.vendorId}${f.value === "all" ? "" : `&status=${f.value}`}`;
          const active = filter === f.value;
          return (
            <Link
              key={f.value}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? "border-berry bg-berry text-paper"
                  : "border-line-strong text-ink-soft hover:bg-paper-deep"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      <section className="mt-6">
        {suborders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-10 text-center text-sm text-ink-soft">
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
                  className="rounded-2xl border border-line bg-paper-soft p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">
                        {order?.public_reference ?? `Order #${suborder.id.slice(0, 8)}`}
                      </p>
                      <p className="mt-1 text-sm text-ink-mute">
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
                    <div className="mt-3 rounded-xl bg-paper-soft px-4 py-3 text-sm">
                      <p className="font-medium text-ink">
                        {order.recipient_name} · {order.contact_phone}
                      </p>
                      <p className="text-ink-soft">
                        {order.address_line}, {order.city}, {order.governorate}
                      </p>
                      {order.notes ? (
                        <p className="mt-1 text-ink-mute">
                          Notes: {order.notes}
                        </p>
                      ) : null}
                      <p className="mt-1 text-ink-mute">
                        Cash on delivery — collect {formatEgp(suborder.subtotal_minor)}.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-ink-mute">
                      Delivery details are not available.
                    </p>
                  )}

                  <ul className="mt-4 flex flex-col divide-y divide-line">
                    {(suborder.order_items ?? [])
                      .slice()
                      .sort((a, b) => a.id.localeCompare(b.id))
                      .map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start justify-between gap-4 py-2 text-sm"
                        >
                          <span className="text-ink">
                            {item.product_name}
                            <span className="text-ink-mute">
                              {" "}
                              × {item.quantity}
                            </span>
                          </span>
                          <span className="whitespace-nowrap font-medium text-ink">
                            {formatEgp(item.line_total_minor)}
                          </span>
                        </li>
                      ))}
                  </ul>

                  <p className="mt-2 text-right text-sm text-ink-soft">
                    Subtotal:{" "}
                    <span className="font-medium text-ink">
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
