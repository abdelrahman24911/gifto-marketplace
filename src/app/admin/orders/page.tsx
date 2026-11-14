import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatEgp } from "@/lib/money";
import {
  ORDER_STATUS_LABELS,
  isOrderStatus,
} from "@/lib/orders";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";

import {
  AdminFilterPill,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../ui";

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

const STATUS_STYLES: Record<OrderStatus, string> = {
  placed: "border-warning/30 bg-warning-soft text-ink",
  confirmed: "border-berry/25 bg-berry-soft text-ink",
  shipped: "border-gold/40 bg-gold-soft text-ink",
  delivered: "border-success/25 bg-success-soft text-ink",
  cancelled: "border-line-strong bg-paper text-ink-mute",
  returned: "border-danger/25 bg-danger-soft text-ink",
  partially_completed: "border-line-strong bg-paper-deep text-ink-soft",
};

function adminOrdersHref(filter: string, page = 1) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

function countValue(result: { count: number | null; error: unknown }) {
  return result.error ? "—" : (result.count ?? 0);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const [
    listResult,
    allCountResult,
    attentionCountResult,
    deliveredCountResult,
    closedCountResult,
  ] = await Promise.all([
    listQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(range.from, range.to),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ATTENTION_STATUSES),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["cancelled", "returned"]),
  ]);

  const total = listResult.count ?? 0;
  const currentPage = clampPage(requestedPage, total);

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(adminOrdersHref(filter, currentPage));
  }

  const orders = listResult.data ?? [];
  const attentionCount = attentionCountResult.count ?? 0;

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Orders" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Operations"
          title="Orders"
          description="Read-only oversight of every marketplace order and its shop suborders. Progress is driven by each vendor, not by administration."
        />
      </div>

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "All orders",
              value: countValue(allCountResult),
              hint: "Across every shop",
              emphasis: "accent",
            },
            {
              label: "Needs attention",
              value: countValue(attentionCountResult),
              hint: "Placed, confirmed, or shipped",
              emphasis: attentionCount > 0 ? "warning" : "default",
            },
            {
              label: "Delivered",
              value: countValue(deliveredCountResult),
              hint: "Completed successfully",
              emphasis: "positive",
            },
            {
              label: "Cancelled / returned",
              value: countValue(closedCountResult),
              hint: "Closed without completion",
            },
          ]}
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap gap-2 border-b border-line pb-5">
          {ADMIN_FILTERS.map((option) => (
            <AdminFilterPill
              key={option.value}
              href={adminOrdersHref(option.value)}
              active={filter === option.value}
            >
              {option.label}
            </AdminFilterPill>
          ))}
        </div>

        {listResult.error ? (
          <div className="mt-4">
            <AdminNotice tone="danger" role="alert">
              Orders could not be loaded. Refresh the page to try again.
            </AdminNotice>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs text-ink-mute">
            {total.toLocaleString("en-US")}{" "}
            {total === 1 ? "order" : "orders"}
            {filter === "all" ? "" : " match this filter"}
          </p>
          <p className="text-xs text-ink-mute">
            Newest first · page {currentPage} of{" "}
            {Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE))}
          </p>
        </div>

        {listResult.error ? null : orders.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={
                filter === "all"
                  ? "No orders placed yet"
                  : "No orders match this filter"
              }
            >
              {filter === "all"
                ? "Marketplace orders will appear here as soon as customers check out."
                : "Choose another status to see more orders."}
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {orders.map((order) => {
              const status: OrderStatus = isOrderStatus(order.status)
                ? order.status
                : "placed";
              const suborders = order.order_vendors ?? [];

              return (
                <li
                  key={order.id}
                  className="rounded-2xl border border-line bg-paper-soft p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-medium text-ink">
                          {order.public_reference ?? `#${order.id.slice(0, 8)}`}
                        </h2>
                        {order.user_id === null ? (
                          <span className="rounded-full border border-warning/30 bg-warning-soft px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-ink">
                            Guest
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}
                        >
                          {ORDER_STATUS_LABELS[status]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-mute">
                        {formatDateTime(order.created_at)} ·{" "}
                        {suborders.length}{" "}
                        {suborders.length === 1 ? "shop" : "shops"}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-display text-2xl tabular-nums text-ink">
                        {formatEgp(order.total_minor)}
                      </p>
                      <p className="mt-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                        Order total
                      </p>
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-xl border border-line bg-paper px-4 py-3 text-sm sm:grid-cols-2">
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-ink-mute">Recipient</dt>
                      <dd className="text-ink">{order.recipient_name}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-ink-mute">Phone</dt>
                      <dd className="text-ink">{order.contact_phone}</dd>
                    </div>
                    {order.contact_email ? (
                      <div className="flex min-w-0 gap-1.5">
                        <dt className="shrink-0 text-ink-mute">Email</dt>
                        <dd className="break-all text-ink">
                          {order.contact_email}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-ink-mute">Deliver to</dt>
                      <dd className="text-ink">
                        {order.city}, {order.governorate}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-2">
                    <div className="flex items-baseline justify-between gap-3 border-b border-line py-3 text-xs text-ink-mute">
                      <span>Shop suborders</span>
                      <span>
                        Products {formatEgp(order.subtotal_minor)} · delivery{" "}
                        {formatEgp(order.delivery_fee_minor)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {suborders.map((suborder) => {
                        const subStatus: OrderStatus = isOrderStatus(
                          suborder.status,
                        )
                          ? suborder.status
                          : "placed";
                        const commission = suborder.commission_entries;

                        return (
                          <div
                            key={suborder.id}
                            className="rounded-xl border border-line bg-paper p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-ink">
                                {suborder.vendor?.name ?? "Unknown shop"}
                              </p>
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[subStatus]}`}
                              >
                                {ORDER_STATUS_LABELS[subStatus]}
                              </span>
                            </div>

                            <ul className="mt-3 flex flex-col divide-y divide-line">
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
                                    <span className="text-ink-soft">
                                      {item.product_name}
                                      <span className="text-ink-mute">
                                        {" "}
                                        × {item.quantity}
                                      </span>
                                    </span>
                                    <span className="whitespace-nowrap tabular-nums text-ink">
                                      {formatEgp(item.line_total_minor)}
                                    </span>
                                  </li>
                                ))}
                            </ul>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
                              <span className="text-ink-mute">
                                Subtotal{" "}
                                <span className="font-medium tabular-nums text-ink">
                                  {formatEgp(suborder.subtotal_minor)}
                                </span>
                              </span>
                              <span className="text-ink-mute">
                                Commission{" "}
                                {commission ? (
                                  <span
                                    className={
                                      commission.status === "reversed"
                                        ? "font-medium text-danger line-through"
                                        : "font-medium tabular-nums text-ink"
                                    }
                                  >
                                    {formatEgp(commission.amount_minor)}
                                  </span>
                                ) : (
                                  <span className="font-medium text-ink-mute">
                                    not earned
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Link
                      href="/admin/commissions"
                      className="text-xs font-medium text-berry hover:text-berry-deep"
                    >
                      View commission ledger
                    </Link>
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
      </section>
    </div>
  );
}
