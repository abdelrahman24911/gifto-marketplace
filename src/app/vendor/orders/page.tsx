import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import {
  BUSINESS_TIME_ZONE,
  startOfBusinessDayOffset,
} from "@/lib/business-time";
import { formatEgp } from "@/lib/money";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/orders";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";
import { requireVendorRole } from "@/lib/vendor";

import {
  VendorEmpty,
  VendorFilterPill,
  VendorNotice,
  VendorPageHeader,
} from "../ui";
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

const CLOSED_STATUSES = "(delivered,cancelled,returned)";
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

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

function ordersHref(
  vendorId: string,
  filter: string,
  page = 1,
  query = "",
  dateRange: OrderRange = "all",
) {
  const params = new URLSearchParams({ vendor: vendorId });
  if (filter !== "all") params.set("status", filter);
  if (query) params.set("q", query);
  if (dateRange !== "all") params.set("range", dateRange);
  if (page > 1) params.set("page", String(page));
  return `/vendor/orders?${params.toString()}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    vendor?: string;
    status?: string;
    page?: string;
    q?: string;
    range?: string;
  }>;
}) {
  const {
    vendor,
    status: statusFilter,
    page: pageParam,
    q: query,
    range: rangeParam,
  } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

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

  let matchingOrderIds: string[] | null = null;
  let searchFailed = false;

  if (searchTerm) {
    const { data: matches, error: matchError } = await supabase
      .from("orders")
      .select("id")
      .or(
        `public_reference.ilike.%${searchTerm}%,recipient_name.ilike.%${searchTerm}%,contact_phone.ilike.%${searchTerm}%`,
      )
      .limit(100);

    if (matchError) {
      searchFailed = true;
    } else {
      matchingOrderIds = (matches ?? []).map((order) => order.id);
    }
  }

  let listQuery = supabase
    .from("order_vendors")
    .select(
      "id, status, subtotal_minor, created_at, courier_name, tracking_ref, handed_over_at, order:orders(id, public_reference, recipient_name, contact_phone, address_line, city, governorate, notes, gift_wrap, gift_message, preferred_delivery_date, delivery_time_note, created_at), order_items(id, product_name, quantity, unit_price_minor, line_total_minor)",
      { count: "exact" },
    )
    .eq("vendor_id", access.vendorId);

  if (dateStart) {
    listQuery = listQuery.gte("created_at", dateStart.toISOString());
  }

  if (filter === "open") {
    listQuery = listQuery.not("status", "in", CLOSED_STATUSES);
  } else if (filter !== "all" && isOrderStatus(filter)) {
    listQuery = listQuery.eq("status", filter);
  }

  if (matchingOrderIds) {
    listQuery = listQuery.in(
      "order_id",
      matchingOrderIds.length > 0 ? matchingOrderIds : [NO_MATCH_ID],
    );
  } else if (searchFailed) {
    listQuery = listQuery.eq("order_id", NO_MATCH_ID);
  }

  const [listResult, { count: openTotal }] = await Promise.all([
    listQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(range.from, range.to),
    supabase
      .from("order_vendors")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", access.vendorId)
      .not("status", "in", CLOSED_STATUSES),
  ]);

  const total = listResult.count ?? 0;
  const clamped = clampPage(requestedPage, total);

  if (
    requestedPage > 1 &&
    (listResult.error || (listResult.data ?? []).length === 0)
  ) {
    let lastPage = clamped;
    if (listResult.count === null) {
      const { count } = await supabase
        .from("order_vendors")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", access.vendorId);
      lastPage = clampPage(requestedPage, count ?? 0);
    }
    if (lastPage !== requestedPage) {
      redirect(
        ordersHref(access.vendorId, filter, lastPage, search, dateRange),
      );
    }
  }

  const suborders = listResult.data ?? [];
  const openCount = openTotal ?? 0;
  const loadFailed = Boolean(listResult.error);
  const activeFilter = FILTERS.find((option) => option.value === filter);

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Order desk"
        title="Orders"
        description={
          <>
            Confirm, ship and close each shop line yourself. Delivery details
            are only shown for {access.vendorName}.
          </>
        }
        actions={
          <Link
            href={ordersHref(access.vendorId, "open", 1, "", dateRange)}
            className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
          >
            {openCount} open {openCount === 1 ? "line" : "lines"}
          </Link>
        }
      />

      {!canManage ? (
        <div className="mt-4">
          <VendorNotice tone="info">
            Staff access is read-only for orders. Owners and managers can
            update shop-line status.
          </VendorNotice>
        </div>
      ) : null}

      {searchFailed ? (
        <div className="mt-4">
          <VendorNotice tone="danger" role="alert">
            Order search could not be completed. Clear the search to see all
            orders again.
          </VendorNotice>
        </div>
      ) : null}

      {loadFailed ? (
        <div className="mt-4">
          <VendorNotice tone="danger" role="alert">
            Orders couldn&apos;t load. Refresh the page or try a different
            filter.
          </VendorNotice>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="Filter orders" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <VendorFilterPill
              key={option.value}
              href={ordersHref(
                access.vendorId,
                option.value,
                1,
                search,
                dateRange,
              )}
              active={filter === option.value}
            >
              {option.label}
            </VendorFilterPill>
          ))}
        </nav>

        <form
          action="/vendor/orders"
          method="get"
          className="flex w-full max-w-xl items-center gap-2"
        >
          <input type="hidden" name="vendor" value={access.vendorId} />
          {filter !== "all" ? (
            <input type="hidden" name="status" value={filter} />
          ) : null}
          {dateRange !== "all" ? (
            <input type="hidden" name="range" value={dateRange} />
          ) : null}
          <label htmlFor="order-search" className="sr-only">
            Search orders
          </label>
          <input
            id="order-search"
            type="search"
            name="q"
            defaultValue={search}
            maxLength={80}
            placeholder="Order reference, customer or phone"
            className="min-w-0 flex-1 rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/20"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-berry px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
          >
            Search
          </button>
          {search ? (
            <Link
              href={ordersHref(access.vendorId, filter, 1, "", dateRange)}
              className="shrink-0 text-sm font-medium text-ink-soft hover:text-berry"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-mute">
          Placed within
        </span>
        {ORDER_RANGES.map((option) => (
          <VendorFilterPill
            key={option.value}
            href={ordersHref(
              access.vendorId,
              filter,
              1,
              search,
              option.value,
            )}
            active={dateRange === option.value}
          >
            {option.label}
          </VendorFilterPill>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-mute">
        <p>
          {total.toLocaleString("en-GB")}{" "}
          {total === 1 ? "shop line" : "shop lines"}
          {activeFilter && activeFilter.value !== "all"
            ? ` · ${activeFilter.label}`
            : ""}
          {dateRange !== "all" ? ` · last ${dateOption.label}` : ""}
          {searchTerm ? ` · matching “${search}”` : ""}
        </p>
        <p>
          {openCount} open across this shop · cash on delivery
        </p>
      </div>

      <section className="mt-5">
        {suborders.length === 0 ? (
          <VendorEmpty
            title={
              loadFailed
                ? "Orders couldn't load"
                : searchFailed
                  ? "Search unavailable"
                  : searchTerm
                    ? "No matching orders"
                    : "No orders here"
            }
            action={
              searchTerm ? (
                <Link
                  href={ordersHref(access.vendorId, filter, 1, "", dateRange)}
                  className="text-sm font-medium text-berry hover:text-berry-deep"
                >
                  Clear search
                </Link>
              ) : null
            }
          >
            {loadFailed
              ? "The order list didn't respond. Refresh the page to try again."
              : searchFailed
                ? "Try clearing the search and filtering by status instead."
                : searchTerm
                  ? "Try the order reference, recipient name, phone number, or a different status."
                  : dateRange !== "all"
                    ? "No shop lines were placed in this date range. Try a longer range or another status."
                    : filter === "all"
                      ? "Orders will appear here as soon as customers check out."
                      : "There are no shop lines in this status right now."}
          </VendorEmpty>
        ) : (
          <ul className="flex flex-col gap-4">
            {suborders.map((suborder) => {
              const order = suborder.order;
              const status: OrderStatus = isOrderStatus(suborder.status)
                ? suborder.status
                : "placed";
              const items = (suborder.order_items ?? [])
                .slice()
                .sort((a, b) => a.id.localeCompare(b.id));

              return (
                <li
                  key={suborder.id}
                  className="overflow-hidden rounded-2xl border border-line bg-paper-soft"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-paper px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                      <p className="font-display text-xl leading-tight text-ink">
                        <Link
                          href={`/vendor/orders/${suborder.id}?vendor=${access.vendorId}`}
                          className="transition-colors hover:text-berry"
                        >
                          {order?.public_reference ??
                            `Order #${suborder.id.slice(0, 8)}`}
                        </Link>
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        Line {suborder.id.slice(0, 8)} · placed{" "}
                        {formatDateTime(suborder.created_at)}
                      </p>
                      {suborder.courier_name ? (
                        <p className="mt-1 text-xs text-ink-mute">
                          Shipped via {suborder.courier_name}
                          {suborder.tracking_ref
                            ? ` · ${suborder.tracking_ref}`
                            : ""}
                          {suborder.handed_over_at
                            ? ` · handed over ${formatDateTime(suborder.handed_over_at)}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${ORDER_STATUS_STYLES[status]}`}
                    >
                      {ORDER_STATUS_LABELS[status]}
                    </span>
                  </div>

                  <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                    <div className="border-b border-line px-4 py-4 sm:px-5 lg:border-b-0 lg:border-r">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                        Deliver to
                      </p>
                      {order ? (
                        <div className="mt-2 text-sm leading-relaxed">
                          <p className="font-medium text-ink">
                            {order.recipient_name}
                          </p>
                          <p className="text-ink-soft">{order.contact_phone}</p>
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
                              {order.gift_message
                                ? ` — “${order.gift_message}”`
                                : ""}
                            </p>
                          ) : null}
                          {order.preferred_delivery_date ? (
                            <p className="mt-2 text-xs text-ink-mute">
                              Preferred delivery day:{" "}
                              {order.preferred_delivery_date}
                              {order.delivery_time_note
                                ? ` · ${order.delivery_time_note}`
                                : ""}
                            </p>
                          ) : order.delivery_time_note ? (
                            <p className="mt-2 text-xs text-ink-mute">
                              Preferred delivery time:{" "}
                              {order.delivery_time_note}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-ink-mute">
                            Cash on delivery — collect{" "}
                            {formatEgp(suborder.subtotal_minor)}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-ink-mute">
                          Delivery details are not available.
                        </p>
                      )}
                    </div>

                    <div className="px-4 py-4 sm:px-5">
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
                      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
                        <span className="font-medium text-ink-soft">
                          Shop subtotal
                        </span>
                        <span className="font-display text-xl tabular-nums text-ink">
                          {formatEgp(suborder.subtotal_minor)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {canManage && isOrderStatus(suborder.status) ? (
                    <div className="border-t border-line bg-paper px-4 py-4 sm:px-5">
                      <SuborderActions
                        suborderId={suborder.id}
                        vendorId={access.vendorId}
                        status={suborder.status}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <Pagination
          page={clamped}
          total={total}
          pageSize={DEFAULT_PAGE_SIZE}
          label="Orders pages"
          buildHref={(page) =>
            ordersHref(access.vendorId, filter, page, search, dateRange)
          }
        />
      </section>
    </div>
  );
}
