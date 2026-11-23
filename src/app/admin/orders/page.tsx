import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { startOfBusinessDayOffset } from "@/lib/business-time";
import { returnedCommissionNote } from "@/lib/finance";
import {
  maskEmail,
  maskName,
  maskPhone,
} from "@/lib/mask-contact";
import { formatEgp } from "@/lib/money";
import { ORDER_STATUS_LABELS, isOrderStatus } from "@/lib/orders";
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

import {
  ADMIN_ORDER_STATUS_STYLES,
  ATTENTION_STATUSES,
  formatOrderDateTime,
} from "./order-shared";

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

type OrderRange = "7d" | "30d" | "90d" | "all";

const ORDER_RANGES: ReadonlyArray<{
  value: OrderRange;
  label: string;
  days: number | null;
}> = [
  { value: "all", label: "All dates", days: null },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
];

function isOrderRange(value: string | undefined): value is OrderRange {
  return value === "7d" || value === "30d" || value === "90d" || value === "all";
}

function adminOrdersHref(
  filter: string,
  page = 1,
  search = "",
  dateRange: OrderRange = "all",
) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("status", filter);
  if (search) params.set("q", search);
  if (dateRange !== "all") params.set("range", dateRange);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

function countValue(result: { count: number | null; error: unknown }) {
  return result.error ? "—" : (result.count ?? 0);
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    q?: string;
    range?: string;
  }>;
}) {
  const {
    status: statusFilter,
    page: pageParam,
    q: query,
    range: rangeParam,
  } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  const filter = statusFilter ?? "all";
  const dateRange: OrderRange = isOrderRange(rangeParam) ? rangeParam : "all";
  const dateOption = ORDER_RANGES.find((option) => option.value === dateRange)!;
  const dateStart =
    dateOption.days === null
      ? null
      : startOfBusinessDayOffset(new Date(), dateOption.days - 1);
  const search = (query ?? "").trim().slice(0, 80);
  const searchTerm = search.replace(/[,()"%_\\]/g, " ").replace(/\s+/g, " ").trim();
  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  let listQuery = supabase
    .from("orders")
    .select(
      "id, public_reference, user_id, status, subtotal_minor, delivery_fee_minor, total_minor, recipient_name, contact_phone, contact_email, city, governorate, created_at, order_vendors(id, status, subtotal_minor, commission_rate, vendor:vendors(name, slug), order_items(product_name, quantity, line_total_minor), commission_entries(amount_minor, status))",
      { count: "exact" },
    );

  if (dateStart) {
    listQuery = listQuery.gte("created_at", dateStart.toISOString());
  }

  if (searchTerm) {
    listQuery = listQuery.or(
      `public_reference.ilike.%${searchTerm}%,recipient_name.ilike.%${searchTerm}%,contact_phone.ilike.%${searchTerm}%,contact_email.ilike.%${searchTerm}%`,
    );
  }

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
    redirect(adminOrdersHref(filter, currentPage, search, dateRange));
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
          description="Search, inspect and intervene in marketplace orders. Vendors drive normal progress; administration handles exceptions with recorded reasons. Contact details are masked in this list — open an order for the full details."
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
        <div className="flex flex-col gap-4 border-b border-line pb-5">
          <div className="flex flex-wrap gap-2">
            {ADMIN_FILTERS.map((option) => (
              <AdminFilterPill
                key={option.value}
                href={adminOrdersHref(
                  option.value,
                  1,
                  search,
                  dateRange,
                )}
                active={filter === option.value}
              >
                {option.label}
              </AdminFilterPill>
            ))}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form
              action="/admin/orders"
              method="get"
              className="flex flex-wrap items-center gap-2"
            >
              {filter !== "all" ? (
                <input type="hidden" name="status" value={filter} />
              ) : null}
              {dateRange !== "all" ? (
                <input type="hidden" name="range" value={dateRange} />
              ) : null}
              <label htmlFor="admin-order-search" className="sr-only">
                Search orders
              </label>
              <input
                id="admin-order-search"
                name="q"
                type="search"
                defaultValue={search}
                maxLength={80}
                placeholder="Reference, recipient, phone or email"
                className="w-full min-w-0 rounded-full border border-line-strong bg-paper px-4 py-2 text-sm text-ink sm:w-72"
              />
              <button
                type="submit"
                className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
              >
                Search
              </button>
              {search ? (
                <Link
                  href={adminOrdersHref(filter, 1, "", dateRange)}
                  className="text-xs font-medium text-berry hover:text-berry-deep"
                >
                  Clear search
                </Link>
              ) : null}
            </form>

            <nav aria-label="Filter by date" className="flex flex-wrap gap-2">
              {ORDER_RANGES.map((option) => (
                <AdminFilterPill
                  key={option.value}
                  href={adminOrdersHref(
                    filter,
                    1,
                    search,
                    option.value,
                  )}
                  active={dateRange === option.value}
                >
                  {option.label}
                </AdminFilterPill>
              ))}
            </nav>
          </div>
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
            {search
              ? ` matching "${search}"`
              : filter === "all"
                ? ""
                : " match this filter"}
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
                search
                  ? "No orders match this search"
                  : filter !== "all" || dateRange !== "all"
                    ? "No orders match this view"
                    : "No orders placed yet"
              }
            >
              {search
                ? "Try a different reference, recipient, phone number or email."
                : filter !== "all" || dateRange !== "all"
                  ? "Choose another status or date range to see more orders."
                  : "Marketplace orders will appear here as soon as customers check out."}
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
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="transition-colors hover:text-berry"
                          >
                            {order.public_reference ??
                              `#${order.id.slice(0, 8)}`}
                          </Link>
                        </h2>
                        {order.user_id === null ? (
                          <span className="rounded-full border border-warning/30 bg-warning-soft px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-ink">
                            Guest
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${ADMIN_ORDER_STATUS_STYLES[status]}`}
                        >
                          {ORDER_STATUS_LABELS[status]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-mute">
                        {formatOrderDateTime(order.created_at)} ·{" "}
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
                      <dd className="text-ink">
                        {maskName(order.recipient_name)}
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-ink-mute">Phone</dt>
                      <dd className="text-ink">
                        {maskPhone(order.contact_phone)}
                      </dd>
                    </div>
                    {order.contact_email ? (
                      <div className="flex min-w-0 gap-1.5">
                        <dt className="shrink-0 text-ink-mute">Email</dt>
                        <dd className="break-all text-ink">
                          {maskEmail(order.contact_email)}
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
                        const commissionNote = returnedCommissionNote({
                          status: suborder.status ?? "",
                          commission: commission ?? null,
                          clawbacks: [],
                        });

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
                                className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${ADMIN_ORDER_STATUS_STYLES[subStatus]}`}
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
                            {commissionNote ? (
                              <p className="mt-2 text-xs leading-relaxed text-ink-mute">
                                {commissionNote}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap justify-end gap-4">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-xs font-medium text-berry hover:text-berry-deep"
                    >
                      View order details
                    </Link>
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
