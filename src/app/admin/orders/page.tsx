import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatEgp } from "@/lib/money";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  isOrderStatus,
} from "@/lib/orders";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";

import type { OrderStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Orders — Admin — Gifto" };

const ADMIN_FILTERS = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "placed", label: "Placed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
  { value: "partially_completed", label: "Partially completed" },
] as const;

const ATTENTION_STATUSES: OrderStatus[] = [
  "placed",
  "confirmed",
  "shipped",
];

function adminOrdersHref(filter: string, page = 1) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status: statusFilter, page: pageParam } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  const filter = statusFilter ?? "all";
  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  let listQuery = supabase
    .from("orders")
    .select(
      "id, public_reference, user_id, status, subtotal_minor, delivery_fee_minor, total_minor, recipient_name, contact_phone, contact_email, city, governorate, created_at, order_vendors(id, status, subtotal_minor, commission_rate, vendor:vendors(name, slug), order_items(product_name, quantity, line_total_minor), commission_entries(amount_minor, status))",
      { count: "exact" },
    );

  if (filter === "attention") {
    listQuery = listQuery.in("status", ATTENTION_STATUSES);
  } else if (filter !== "all" && isOrderStatus(filter)) {
    listQuery = listQuery.eq("status", filter);
  }

  const [listResult, { count: openCount }] = await Promise.all([
    listQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(range.from, range.to),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("status", "in", "(delivered,cancelled,returned)"),
  ]);

  const total = listResult.count ?? 0;
  const currentPage = clampPage(requestedPage, total);

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(adminOrdersHref(filter, currentPage));
  }

  const orders = listResult.data ?? [];
  const inProgress = openCount ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            ← Back to administration
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Marketplace orders
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Read-only oversight of every order across all shops · {inProgress}{" "}
            in progress
          </p>
        </div>
      </div>

      <nav aria-label="Filter orders" className="mt-6 flex flex-wrap gap-2">
        {ADMIN_FILTERS.map((f) => {
          const href = adminOrdersHref(f.value);
          const active = filter === f.value;
          return (
            <Link
              key={f.value}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {listResult.error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Orders could not be loaded. Refresh the page to try again.
        </p>
      ) : null}

      {orders.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center text-sm text-zinc-600">
          {filter === "all"
            ? "No orders have been placed yet."
            : "No orders match this filter."}
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {orders.map((order) => {
            const status: OrderStatus = isOrderStatus(order.status)
              ? order.status
              : "placed";

            return (
              <li
                key={order.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium text-zinc-900">
                      <span>
                        {order.public_reference ?? `#${order.id.slice(0, 8)}`}
                      </span>
                      {order.user_id === null ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Guest
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {new Date(order.created_at).toLocaleString("en-GB", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-zinc-900">
                      {formatEgp(order.total_minor)}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${ORDER_STATUS_STYLES[status]}`}
                    >
                      {ORDER_STATUS_LABELS[status]}
                    </span>
                  </div>
                </div>

                <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt className="text-zinc-500">Recipient:</dt>
                    <dd className="text-zinc-800">{order.recipient_name}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-zinc-500">Phone:</dt>
                    <dd className="text-zinc-800">{order.contact_phone}</dd>
                  </div>
                  {order.contact_email ? (
                    <div className="flex gap-1">
                      <dt className="text-zinc-500">Email:</dt>
                      <dd className="text-zinc-800">{order.contact_email}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-1 sm:col-span-2">
                    <dt className="text-zinc-500">Deliver to:</dt>
                    <dd className="text-zinc-800">
                      {order.city}, {order.governorate}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-col gap-3">
                  {(order.order_vendors ?? []).map((suborder) => {
                    const subStatus: OrderStatus = isOrderStatus(
                      suborder.status,
                    )
                      ? suborder.status
                      : "placed";
                    const commission = suborder.commission_entries;

                    return (
                      <div
                        key={suborder.id}
                        className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-zinc-800">
                            {suborder.vendor?.name ?? "Unknown shop"}
                          </p>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${ORDER_STATUS_STYLES[subStatus]}`}
                            >
                              {ORDER_STATUS_LABELS[subStatus]}
                            </span>
                          </div>
                        </div>

                        <ul className="mt-3 flex flex-col divide-y divide-zinc-200">
                          {(suborder.order_items ?? [])
                            .slice()
                            .sort((a, b) =>
                              a.product_name.localeCompare(b.product_name),
                            )
                            .map((item, index) => (
                              <li
                                key={`${suborder.id}-${index}`}
                                className="flex items-start justify-between gap-4 py-1.5 text-sm"
                              >
                                <span className="text-zinc-700">
                                  {item.product_name}
                                  <span className="text-zinc-400">
                                    {" "}
                                    × {item.quantity}
                                  </span>
                                </span>
                                <span className="whitespace-nowrap text-zinc-800">
                                  {formatEgp(item.line_total_minor)}
                                </span>
                              </li>
                            ))}
                        </ul>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-zinc-500">
                            Subtotal{" "}
                            <span className="font-medium text-zinc-900">
                              {formatEgp(suborder.subtotal_minor)}
                            </span>
                          </span>
                          <span className="text-zinc-500">
                            Commission{" "}
                            {commission ? (
                              <span
                                className={
                                  commission.status === "reversed"
                                    ? "font-medium text-rose-600 line-through"
                                    : "font-medium text-zinc-900"
                                }
                              >
                                {formatEgp(commission.amount_minor)}
                              </span>
                            ) : (
                              <span className="font-medium text-zinc-400">
                                not earned
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={currentPage}
        total={total}
        pageSize={DEFAULT_PAGE_SIZE}
        label="Marketplace order pages"
        buildHref={(page) => adminOrdersHref(filter, page)}
      />
    </div>
  );
}
