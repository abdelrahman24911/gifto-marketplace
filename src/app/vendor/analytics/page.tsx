import Link from "next/link";

import { BarChart } from "@/components/bar-chart";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatEgp } from "@/lib/money";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  type OrderStatus,
} from "@/lib/orders";
import {
  ANALYTICS_ALL_TIME_ROW_LIMIT,
  ANALYTICS_RANGES,
  analyticsQueryLimit,
  analyticsWindowStart,
  computeVendorAnalytics,
  isAnalyticsRange,
  type AnalyticsRange,
  type AnalyticsSuborder,
} from "@/lib/vendor-analytics";
import { requireVendorRole } from "@/lib/vendor";

import {
  VendorEmpty,
  VendorFilterPill,
  VendorPageHeader,
  VendorStatStrip,
} from "../ui";

export const metadata = { title: "Analytics — Gifto" };

const LOW_STOCK_THRESHOLD = 5;

type InventoryRow = {
  id: string;
  name: string;
  stock: number;
  status: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "revenue" | "muted" | "warning";
}) {
  const toneClasses =
    tone === "revenue"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/60 text-amber-900"
        : tone === "muted"
          ? "border-line bg-paper text-ink-soft"
          : "border-line bg-paper-soft text-ink";

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses}`}>
      <dt className="text-xs uppercase tracking-wide opacity-70">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {hint ? <p className="mt-1 text-[11px] opacity-70">{hint}</p> : null}
    </div>
  );
}

export default async function VendorAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; range?: string }>;
}) {
  const { vendor, range: rangeParam } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const range: AnalyticsRange = isAnalyticsRange(rangeParam)
    ? rangeParam
    : "30d";
  const queryStart = analyticsWindowStart(range);
  const queryLimit = analyticsQueryLimit(range);

  const fetchSuborderPage = (from: number, to: number) => {
    let query = supabase
      .from("order_vendors")
      .select(
        "id, status, subtotal_minor, created_at, delivered_at, order_items(product_id, product_name, quantity, line_total_minor)",
      )
      .eq("vendor_id", access.vendorId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (queryStart) {
      query = query.or(
        `created_at.gte.${queryStart.toISOString()},delivered_at.gte.${queryStart.toISOString()}`,
      );
    }

    return query.returns<AnalyticsSuborder[]>();
  };

  const [subordersResult, inventoryResult] = await Promise.all([
    queryLimit
      ? fetchSuborderPage(0, queryLimit - 1)
      : fetchAllRows<AnalyticsSuborder>(fetchSuborderPage),
    supabase
      .from("products")
      .select("id, name, stock, status")
      .eq("vendor_id", access.vendorId)
      .eq("status", "active")
      .lte("stock", LOW_STOCK_THRESHOLD)
      .order("stock", { ascending: true })
      .order("name", { ascending: true })
      .limit(8)
      .returns<InventoryRow[]>(),
  ]);

  const paged = "rows" in subordersResult;
  const suborders = paged
    ? subordersResult.rows
    : (subordersResult.data ?? []);
  const analyticsError = paged
    ? subordersResult.failed
    : Boolean(subordersResult.error);
  const analyticsIncomplete = paged ? subordersResult.truncated : false;

  const analytics = computeVendorAnalytics(suborders, range);

  const statusOrder: OrderStatus[] = [
    "placed",
    "confirmed",
    "shipped",
    "delivered",
    "cancelled",
    "returned",
    "partially_completed",
  ];

  const statusRows = statusOrder
    .map((status) => ({
      status,
      count: analytics.statusCounts[status],
    }))
    .filter((row) => row.count > 0);

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Performance"
        title="Analytics"
        description={
          <>
            Sales performance for {access.vendorName}. Revenue counts shop
            lines delivered in the selected window, matching the finance
            ledger&apos;s completion date.
          </>
        }
        actions={
          <Link
            href={`/vendor/finance?vendor=${access.vendorId}`}
            className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
          >
            Commission ledger
          </Link>
        }
      />

      <nav
        aria-label="Analytics date range"
        className="mt-5 flex flex-wrap gap-2"
      >
        {ANALYTICS_RANGES.map((option) => (
          <VendorFilterPill
            key={option.value}
            href={`/vendor/analytics?vendor=${access.vendorId}&range=${option.value}`}
            active={option.value === range}
          >
            {option.label}
          </VendorFilterPill>
        ))}
      </nav>

      <p className="mt-3 text-xs text-ink-mute">
        {formatDate(analytics.windowStart)} – {formatDate(analytics.windowEnd)}
        {" · "}
        {range === "90d"
          ? "Weekly buckets"
          : range === "all"
            ? "Monthly buckets"
            : "Daily buckets"}
      </p>
      {range === "all" ? (
        <p className="mt-1 text-xs text-amber-800">
          Showing the most recent{" "}
          {ANALYTICS_ALL_TIME_ROW_LIMIT.toLocaleString("en-GB")} shop lines.
          Older lines are excluded from these totals.
        </p>
      ) : null}

      {analyticsIncomplete ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          This shop has more lines in the selected window than can be summed
          safely in one request. The figures below are incomplete; try a
          shorter date range.
        </p>
      ) : null}

      {analyticsError ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-6">
          <h2 className="font-display text-lg text-red-950">
            Analytics couldn&apos;t load
          </h2>
          <p className="mt-2 text-sm text-red-800">
            The order data didn&apos;t respond, so no figures are shown. Try
            again in a moment.
          </p>
          <Link
            href={`/vendor/analytics?vendor=${access.vendorId}&range=${range}`}
            className="mt-4 inline-block rounded-full bg-red-900 px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-red-800"
          >
            Try again
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <VendorStatStrip
              items={[
                {
                  label: "Recognised revenue",
                  value: formatEgp(analytics.revenueMinor),
                  hint: "Delivered in this window",
                  emphasis: "positive",
                },
                {
                  label: "Shop lines placed",
                  value: analytics.totalOrders.toLocaleString("en-GB"),
                  hint:
                    analytics.totalOrders === 1
                      ? "1 order line"
                      : "order lines",
                },
                {
                  label: "Delivered",
                  value: analytics.completedOrders.toLocaleString("en-GB"),
                  hint: "In this window",
                },
                {
                  label: "Average order value",
                  value: formatEgp(analytics.averageOrderValueMinor),
                  hint: "Delivered lines only",
                },
              ]}
            />
          </div>

          {analytics.totalOrders === 0 && analytics.completedOrders === 0 ? (
            <div className="mt-6">
              <VendorEmpty title="No shop lines in this period">
                Nothing was placed or delivered in the selected window. Try a
                longer range to see earlier activity.
              </VendorEmpty>
            </div>
          ) : null}

          <section
            aria-labelledby="reconciliation-heading"
            className="mt-8 rounded-2xl border border-line bg-paper-soft p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id="reconciliation-heading"
                className="font-display text-lg text-ink"
              >
                How placed orders reconcile
              </h2>
              <p className="text-xs text-ink-mute">
                Every line placed in the window is counted once.
              </p>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric
                label="Gross placed"
                value={formatEgp(analytics.grossSalesMinor)}
                hint={`${analytics.totalOrders} placed`}
              />
              <Metric
                label="Delivered from placed"
                value={formatEgp(analytics.placedDeliveredMinor)}
                hint={`${analytics.placedDeliveredOrders} delivered`}
                tone="revenue"
              />
              <Metric
                label="Open pipeline"
                value={formatEgp(analytics.openMinor)}
                hint={`${analytics.openOrders} in progress`}
                tone="warning"
              />
              <Metric
                label="Cancelled"
                value={formatEgp(analytics.cancelledMinor)}
                hint={`${analytics.cancelledOrders} cancelled`}
                tone="muted"
              />
              <Metric
                label="Returned"
                value={formatEgp(analytics.returnedMinor)}
                hint={`${analytics.returnedOrders} returned`}
                tone="muted"
              />
            </dl>
            <p className="mt-3 text-xs text-ink-soft">
              Delivered from placed + open + cancelled + returned equals gross
              placed. Recognised revenue above is counted by delivery date, so
              it can include lines placed before this window and may not match
              this split.
            </p>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section
              aria-labelledby="revenue-chart-heading"
              className="min-w-0 rounded-2xl border border-line bg-paper-soft p-5"
            >
              <h2
                id="revenue-chart-heading"
                className="font-display text-lg text-ink"
              >
                Revenue over time
              </h2>
              <p className="mt-1 text-xs text-ink-mute">
                Grouped by delivery date, including late deliveries from
                earlier placements.
              </p>
              <BarChart
                points={analytics.revenueSeries}
                formatValue={formatEgp}
                ariaLabel="Recognised revenue by period"
                emptyLabel="No delivered shop lines in this period."
              />
            </section>

            <section
              aria-labelledby="orders-chart-heading"
              className="min-w-0 rounded-2xl border border-line bg-paper-soft p-5"
            >
              <h2
                id="orders-chart-heading"
                className="font-display text-lg text-ink"
              >
                Orders placed
              </h2>
              <p className="mt-1 text-xs text-ink-mute">
                Grouped by the date the customer placed the line.
              </p>
              <BarChart
                points={analytics.orderSeries}
                formatValue={(value) =>
                  `${value} ${value === 1 ? "order" : "orders"}`
                }
                ariaLabel="Order lines placed by period"
                emptyLabel="No shop lines were placed in this period."
                tone="gold"
              />
            </section>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section
              aria-labelledby="best-sellers-heading"
              className="min-w-0 rounded-2xl border border-line bg-paper-soft p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="best-sellers-heading"
                  className="font-display text-lg text-ink"
                >
                  Best sellers
                </h2>
                <Link
                  href={`/vendor/products?vendor=${access.vendorId}`}
                  className="text-sm font-medium text-berry hover:text-berry-deep"
                >
                  All products
                </Link>
              </div>
              <p className="mt-1 text-xs text-ink-mute">
                Units and value from delivered lines only.
              </p>

              {analytics.bestSellers.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-8 text-center text-sm text-ink-soft">
                  No delivered items in this period.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
                        <th scope="col" className="pb-2 pr-3 font-medium">
                          Item
                        </th>
                        <th
                          scope="col"
                          className="pb-2 pr-3 text-right font-medium"
                        >
                          Units
                        </th>
                        <th scope="col" className="pb-2 text-right font-medium">
                          Revenue
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {analytics.bestSellers.map((item) => (
                        <tr key={item.key}>
                          <td className="max-w-[13rem] py-2.5 pr-3">
                            {item.key.startsWith("name:") ? (
                              <span className="block truncate text-ink">
                                {item.name}
                              </span>
                            ) : (
                              <Link
                                href={`/vendor/products/${item.key}?vendor=${access.vendorId}`}
                                className="block truncate text-ink underline decoration-line-strong underline-offset-2 hover:text-berry"
                              >
                                {item.name}
                              </Link>
                            )}
                            <span className="text-xs text-ink-mute">
                              {item.orders}{" "}
                              {item.orders === 1 ? "order" : "orders"}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-ink">
                            {item.units}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-ink">
                            {formatEgp(item.revenueMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section
              aria-labelledby="outcomes-heading"
              className="min-w-0 rounded-2xl border border-line bg-paper-soft p-5"
            >
              <h2
                id="outcomes-heading"
                className="font-display text-lg text-ink"
              >
                Order outcomes
              </h2>
              <p className="mt-1 text-xs text-ink-mute">
                Share of shop lines by current status.
              </p>

              {statusRows.length === 0 ? (
                <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-8 text-center text-sm text-ink-soft">
                  No statuses to show yet.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {statusRows.map(({ status, count }) => {
                    const share =
                      analytics.totalOrders > 0
                        ? Math.round((count / analytics.totalOrders) * 100)
                        : 0;
                    return (
                      <li key={status}>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${ORDER_STATUS_STYLES[status]}`}
                          >
                            {ORDER_STATUS_LABELS[status]}
                          </span>
                          <span className="tabular-nums text-ink-soft">
                            {count} · {share}%
                          </span>
                        </div>
                        <div
                          aria-hidden
                          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
                        >
                          <div
                            className="h-full rounded-full bg-berry/70"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <section
        aria-labelledby="stock-heading"
        className="mt-8 rounded-2xl border border-line bg-paper-soft p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="stock-heading" className="font-display text-lg text-ink">
              Stock alerts
            </h2>
            <p className="mt-1 text-xs text-ink-mute">
              Active gifts at {LOW_STOCK_THRESHOLD} units or fewer.
            </p>
          </div>
          <Link
            href={`/vendor/inventory?vendor=${access.vendorId}`}
            className="text-sm font-medium text-berry hover:text-berry-deep"
          >
            Manage inventory
          </Link>
        </div>

        {inventoryResult.error ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Stock alerts couldn&apos;t load. Analytics figures above are
            unaffected.
          </p>
        ) : (inventoryResult.data ?? []).length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-8 text-center text-sm text-ink-soft">
            No active gifts are low in stock.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line rounded-xl border border-line bg-paper">
            {(inventoryResult.data ?? []).map((product) => (
              <li
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  {canManage ? (
                    <Link
                      href={`/vendor/products/${product.id}?vendor=${access.vendorId}`}
                      className="block truncate text-sm font-medium text-ink underline decoration-line-strong underline-offset-2 hover:text-berry"
                    >
                      {product.name}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium text-ink">
                      {product.name}
                    </p>
                  )}
                  <p className="text-xs text-ink-mute">
                    Active · {product.stock} in stock
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    product.stock <= 0
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}
                >
                  {product.stock <= 0 ? "Out of stock" : "Low stock"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs text-ink-mute">
        Revenue uses the same delivered-only basis as{" "}
        <Link
          href={`/vendor/finance?vendor=${access.vendorId}`}
          className="font-medium text-berry hover:text-berry-deep"
        >
          Finance
        </Link>
        . Open lines are pipeline, not income.
      </p>
    </div>
  );
}
