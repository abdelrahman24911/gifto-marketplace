import Link from "next/link";

import { formatEgp } from "@/lib/money";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/orders";
import { requireVendorRole } from "@/lib/vendor";

export const metadata = { title: "Vendor overview — Gifto" };

const LOW_STOCK_THRESHOLD = 5;

export default async function VendorOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const [{ data: allSubordersData }, { data: recentSuborders }, { data: products }] = await Promise.all([
    supabase
      .from("order_vendors")
      .select("id, status")
      .eq("vendor_id", access.vendorId),
    supabase
      .from("order_vendors")
      .select(
        "id, status, subtotal_minor, created_at, order:orders(id, public_reference, created_at)",
      )
      .eq("vendor_id", access.vendorId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("products")
      .select("id, name, status, stock")
      .eq("vendor_id", access.vendorId),
  ]);

  const allSuborders = allSubordersData ?? [];
  const allProducts = products ?? [];
  const recent = recentSuborders ?? [];

  const actionable = allSuborders.filter((s) => {
    const st = s.status as OrderStatus;
    return st === "placed" || st === "confirmed" || st === "shipped";
  }).length;

  const counts = {
    placed: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
    partially_completed: 0,
  } as Record<OrderStatus, number>;

  for (const s of allSuborders) {
    const st = s.status as string;
    if (st in counts) {
      counts[st as OrderStatus]++;
    }
  }

  const lowStock = allProducts.filter(
    (p) =>
      p.status === "active" &&
      typeof p.stock === "number" &&
      p.stock <= LOW_STOCK_THRESHOLD,
  );

  return (
    <div className="w-full">
      <div>
        <h1 className="font-display text-2xl text-ink">Overview</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Your role: {access.role} · shop status: {access.vendorStatus}
        </p>
      </div>

      {!canManage ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are a staff member of this shop, so some actions are read-only for you.
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-mute">
          Actionable orders
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-ink-mute">
              Need action
            </dt>
            <dd className="text-2xl font-semibold text-ink">
              {actionable}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-ink-mute">
              Placed
            </dt>
            <dd className="text-2xl font-semibold text-ink">
              {counts.placed}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-ink-mute">
              Confirmed
            </dt>
            <dd className="text-2xl font-semibold text-ink">
              {counts.confirmed}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-ink-mute">
              Shipped
            </dt>
            <dd className="text-2xl font-semibold text-ink">
              {counts.shipped}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-mute">
              Recent orders
            </h2>
            <Link
              href={`/vendor/orders?vendor=${access.vendorId}`}
              className="text-sm font-medium text-ink underline"
            >
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-8 text-center text-sm text-ink-soft">
              No orders yet.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {recent.map((suborder) => {
                const status: OrderStatus = isOrderStatus(suborder.status)
                  ? suborder.status
                  : "placed";
                const order = Array.isArray(suborder.order)
                  ? suborder.order[0]
                  : suborder.order;
                const ref =
                  order?.public_reference ?? `#${suborder.id.slice(0, 8)}`;
                return (
                  <li
                    key={suborder.id}
                    className="rounded-2xl border border-line bg-paper-soft p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{ref}</p>
                        <p className="text-xs text-ink-mute">
                          {new Date(suborder.created_at).toLocaleString(
                            "en-GB",
                            { dateStyle: "medium", timeStyle: "short" },
                          )}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${ORDER_STATUS_STYLES[status]}`}
                      >
                        {ORDER_STATUS_LABELS[status]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-ink-soft">
                        Subtotal:{" "}
                        <span className="font-medium text-ink">
                          {formatEgp(suborder.subtotal_minor)}
                        </span>
                      </span>
                      <Link
                        href={`/vendor/orders?vendor=${access.vendorId}`}
                        className="font-medium text-ink underline"
                      >
                        Manage
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-mute">
              Low stock (active, ≤ {LOW_STOCK_THRESHOLD})
            </h2>
            <Link
              href={`/vendor/products?vendor=${access.vendorId}`}
              className="text-sm font-medium text-ink underline"
            >
              View products
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-8 text-center text-sm text-ink-soft">
              No active products are low in stock.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-line rounded-2xl border border-line bg-paper-soft">
              {lowStock.slice(0, 10).map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {product.name}
                    </p>
                    <p className="text-xs text-ink-mute">
                      Status: {product.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Stock: {product.stock}
                    </span>
                    {canManage ? (
                      <Link
                        href={`/vendor/products/${product.id}?vendor=${access.vendorId}`}
                        className="text-sm font-medium text-ink underline"
                      >
                        Manage
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
