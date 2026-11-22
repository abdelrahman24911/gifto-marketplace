import Link from "next/link";

import { BarChart } from "@/components/bar-chart";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import {
  ADMIN_ANALYTICS_RANGES,
  adminAnalyticsWindowStart,
  computeAdminMarketplaceMetrics,
  computeAdminProductPerformance,
  computeAdminShopPerformance,
  parseAdminAnalyticsRange,
} from "@/lib/admin-metrics";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatEgp } from "@/lib/money";
import { ORDER_STATUS_LABELS } from "@/lib/orders";

import {
  AdminActionLink,
  AdminFilterPill,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../ui";

import type {
  AdminAnalyticsRange,
  AdminCommissionRecord,
  AdminOrderRecord,
  AdminProductLineRecord,
  AdminShopLineRecord,
} from "@/lib/admin-metrics";
import type { OrderStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Analytics — Admin — Gifto" };

type ShopLineQueryRow = {
  id: string;
  vendor_id: string;
  status: OrderStatus;
  subtotal_minor: number;
  created_at: string;
  vendor: { name: string } | null;
};

type DeliveredItemsQueryRow = {
  id: string;
  delivered_at: string | null;
  order_items:
    | Array<{
        id: string;
        product_id: string | null;
        product_name: string;
        quantity: number;
        line_total_minor: number;
      }>
    | null;
};

const STATUS_ORDER: OrderStatus[] = [
  "placed",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "partially_completed",
];

function rangeLabel(range: AdminAnalyticsRange) {
  return (
    ADMIN_ANALYTICS_RANGES.find((item) => item.value === range)?.label ??
    "Selected period"
  );
}

function formatWindow(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))} (Cairo)`;
}

function formatPercent(value: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = parseAdminAnalyticsRange(params.range);
  const now = new Date();
  const ninetyDayStart = adminAnalyticsWindowStart("90d", now);
  const { supabase } = await requirePlatformAdmin();

  const [ordersResult, commissionsResult, linesResult, deliveredItemsResult] =
    await Promise.all([
    fetchAllRows<AdminOrderRecord>((from, to) =>
      supabase
        .from("orders")
        .select("id, status, subtotal_minor, created_at")
        .gte("created_at", ninetyDayStart.toISOString())
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<AdminOrderRecord[]>(),
    ),
    fetchAllRows<AdminCommissionRecord>((from, to) =>
      supabase
        .from("commission_entries")
        .select(
          "id, vendor_id, status, amount_minor, base_minor, earned_at, reversed_at",
        )
        .gte("earned_at", ninetyDayStart.toISOString())
        .order("earned_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<AdminCommissionRecord[]>(),
    ),
    fetchAllRows<ShopLineQueryRow>((from, to) =>
      supabase
        .from("order_vendors")
        .select(
          "id, vendor_id, status, subtotal_minor, created_at, vendor:vendors(name)",
        )
        .gte("created_at", ninetyDayStart.toISOString())
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<ShopLineQueryRow[]>(),
    ),
    fetchAllRows<DeliveredItemsQueryRow>((from, to) =>
      supabase
        .from("order_vendors")
        .select(
          "id, delivered_at, order_items(id, product_id, product_name, quantity, line_total_minor)",
        )
        .eq("status", "delivered")
        .gte("delivered_at", ninetyDayStart.toISOString())
        .order("delivered_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<DeliveredItemsQueryRow[]>(),
    ),
  ]);

  const metrics = computeAdminMarketplaceMetrics(
    ordersResult.rows,
    commissionsResult.rows,
    range,
    now,
  );
  const shopLines: AdminShopLineRecord[] = linesResult.rows.map((line) => ({
    id: line.id,
    vendor_id: line.vendor_id,
    vendor_name: line.vendor?.name ?? "Removed shop",
    status: line.status,
    subtotal_minor: line.subtotal_minor,
    created_at: line.created_at,
  }));
  const shops = computeAdminShopPerformance(shopLines, range, now).slice(0, 8);

  const deliveredProductLines: AdminProductLineRecord[] =
    deliveredItemsResult.rows.flatMap((suborder) => {
      if (!suborder.delivered_at) return [];
      return (suborder.order_items ?? []).map((item) => ({
        id: item.id,
        order_vendor_id: suborder.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        line_total_minor: item.line_total_minor,
        delivered_at: suborder.delivered_at!,
      }));
    });
  const products = computeAdminProductPerformance(
    deliveredProductLines,
    range,
    now,
  ).slice(0, 8);

  const ordersFailed = ordersResult.failed;
  const commissionsFailed = commissionsResult.failed;
  const linesFailed = linesResult.failed;
  const productsFailed = deliveredItemsResult.failed;
  const readsIncomplete =
    ordersResult.truncated ||
    commissionsResult.truncated ||
    linesResult.truncated ||
    deliveredItemsResult.truncated;
  const maxShopGross = Math.max(1, ...shops.map((shop) => shop.grossMinor));

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Analytics" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Marketplace intelligence"
          title="Analytics"
          description="Demand, placed value, and earned commission across the Gifto marketplace. These figures are operational, not accounting statements."
          actions={
            <AdminActionLink href="/admin/commissions">
              Commission ledger
            </AdminActionLink>
          }
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Analytics date range" className="flex flex-wrap gap-2">
          {ADMIN_ANALYTICS_RANGES.map((option) => (
            <AdminFilterPill
              key={option.value}
              href={`/admin/analytics?range=${option.value}`}
              active={range === option.value}
            >
              {option.label}
            </AdminFilterPill>
          ))}
        </nav>
        <p className="text-xs text-ink-mute">
          {formatWindow(metrics.windowStart, metrics.windowEnd)}
        </p>
      </div>

      {ordersFailed ||
      commissionsFailed ||
      linesFailed ||
      productsFailed ||
      readsIncomplete ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="alert">
            Part of the analytics read did not complete. Figures marked below
            may be incomplete rather than exact. Refresh the page to try again.
          </AdminNotice>
        </div>
      ) : null}

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Placed GMV",
              value: ordersFailed ? "—" : formatEgp(metrics.gmvMinor),
              hint: "Product subtotal, delivery excluded",
              emphasis: "accent",
            },
            {
              label: "Orders placed",
              value: ordersFailed ? "—" : metrics.totalOrders.toLocaleString("en-US"),
              hint: rangeLabel(range),
            },
            {
              label: "Average order",
              value:
                ordersFailed || metrics.totalOrders === 0
                  ? "—"
                  : formatEgp(metrics.averageOrderValueMinor),
              hint: "Placed GMV ÷ orders placed",
            },
            {
              label: "Commission earned",
              value: commissionsFailed
                ? "—"
                : formatEgp(metrics.commissionEarnedMinor),
              hint: "Delivered entries, by earned date",
              emphasis: "positive",
            },
          ]}
        />
      </div>

      <div className="mt-4">
        <AdminNotice tone="info" role="status">
          <span className="font-medium text-ink">How these are calculated:</span>{" "}
          GMV is the product subtotal of orders placed in the selected window,
          including every order status and excluding delivery fees. Commission
          is the snapshotted amount earned when a suborder is delivered, grouped
          by its earned date; reversed entries are excluded. The selected range
          starts at midnight Cairo business time.
        </AdminNotice>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl text-ink">
                Placed GMV over time
              </h2>
              <p className="mt-1 text-xs text-ink-mute">
                {metrics.granularity === "week" ? "Weekly" : "Daily"} buckets ·
                product subtotal only
              </p>
            </div>
            <p className="font-display text-2xl tabular-nums text-ink">
              {ordersFailed ? "—" : formatEgp(metrics.gmvMinor)}
            </p>
          </div>
          {ordersFailed ? (
            <div className="mt-4">
              <AdminNotice tone="danger" role="alert">
                Order data is unavailable, so the trend cannot be drawn.
              </AdminNotice>
            </div>
          ) : (
            <BarChart
              points={metrics.gmvSeries}
              formatValue={formatEgp}
              ariaLabel={`Placed GMV by ${metrics.granularity}`}
              emptyLabel="No orders were placed in this period."
              tone="berry"
            />
          )}
        </section>

        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <div>
            <h2 className="font-display text-2xl text-ink">Order mix</h2>
            <p className="mt-1 text-xs text-ink-mute">
              Every placed order, by current status
            </p>
          </div>

          {ordersFailed ? (
            <p className="mt-4 text-sm text-ink-mute">
              Status breakdown unavailable.
            </p>
          ) : metrics.totalOrders === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-8 text-center text-sm text-ink-soft">
              No orders in this period.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {STATUS_ORDER.map((status) => {
                const count = metrics.statusCounts[status];
                const share = count / metrics.totalOrders;
                return (
                  <li key={status}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink-soft">
                        {ORDER_STATUS_LABELS[status]}
                      </span>
                      <span className="tabular-nums text-ink">
                        {count}
                        <span className="ml-2 text-xs text-ink-mute">
                          {formatPercent(count, metrics.totalOrders)}
                        </span>
                      </span>
                    </div>
                    <div
                      aria-hidden
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-deep"
                    >
                      <div
                        className="h-full rounded-full bg-ink/45"
                        style={{ width: `${Math.round(share * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl text-ink">
                Commission earned
              </h2>
              <p className="mt-1 text-xs text-ink-mute">
                Snapshotted when a suborder is delivered
              </p>
            </div>
            <p className="font-display text-2xl tabular-nums text-ink">
              {commissionsFailed ? "—" : formatEgp(metrics.commissionEarnedMinor)}
            </p>
          </div>
          {commissionsFailed ? (
            <div className="mt-4">
              <AdminNotice tone="danger" role="alert">
                Commission data is unavailable, so the trend cannot be drawn.
              </AdminNotice>
            </div>
          ) : (
            <BarChart
              points={metrics.commissionSeries}
              formatValue={formatEgp}
              ariaLabel={`Commission earned by ${metrics.granularity}`}
              emptyLabel="No commission was earned in this period."
              tone="gold"
            />
          )}
        </section>

        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <div>
            <h2 className="font-display text-2xl text-ink">Commission ratio</h2>
            <p className="mt-1 text-xs text-ink-mute">
              Earned commission against placed GMV
            </p>
          </div>
          {ordersFailed || commissionsFailed ? (
            <p className="mt-4 text-sm text-ink-mute">Unavailable.</p>
          ) : metrics.gmvMinor === 0 ? (
            <p className="mt-4 text-sm text-ink-mute">
              No placed GMV in this period.
            </p>
          ) : (
            <div className="mt-6">
              <p className="font-display text-5xl leading-none tabular-nums text-ink">
                {((metrics.commissionEarnedMinor / metrics.gmvMinor) * 100).toFixed(2)}
                <span className="ml-1 text-2xl text-ink-mute">%</span>
              </p>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
                {formatEgp(metrics.commissionEarnedMinor)} earned against{" "}
                {formatEgp(metrics.gmvMinor)} placed. Delivery timing means this
                is not a cohort conversion rate.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-ink">Shop performance</h2>
            <p className="mt-1 text-xs text-ink-mute">
              Suborder value placed in this period · top eight shops
            </p>
          </div>
          <Link
            href="/admin/shops"
            className="text-sm font-medium text-berry hover:text-berry-deep"
          >
            All shops
          </Link>
        </div>

        {linesFailed ? (
          <div className="mt-4">
            <AdminNotice tone="danger" role="alert">
              Shop-level suborder data could not be loaded.
            </AdminNotice>
          </div>
        ) : shops.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No shop activity">
              Shop rankings appear once suborders are placed in this period.
            </EmptyState>
          </div>
        ) : (
          <ol className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {shops.map((shop, index) => (
              <li
                key={shop.vendorId}
                className="grid gap-3 border-b border-line px-5 py-4 last:border-b-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <p className="font-display text-xl tabular-nums text-ink-mute">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="break-words text-sm font-medium text-ink">
                      {shop.name}
                    </p>
                    <p className="text-xs text-ink-mute">
                      {shop.lineCount} {shop.lineCount === 1 ? "line" : "lines"}
                      {" · "}
                      {formatEgp(shop.deliveredMinor)} delivered
                    </p>
                  </div>
                  <div
                    aria-hidden
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep"
                  >
                    <div
                      className="h-full rounded-full bg-berry/70"
                      style={{
                        width: `${Math.max(
                          2,
                          Math.round((shop.grossMinor / maxShopGross) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-left font-display text-xl tabular-nums text-ink sm:text-right">
                  {formatEgp(shop.grossMinor)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <div>
          <h2 className="font-display text-2xl text-ink">Product performance</h2>
          <p className="mt-1 text-xs text-ink-mute">
            Delivered item value in this period · top eight products
          </p>
        </div>

        {productsFailed ? (
          <div className="mt-4">
            <AdminNotice tone="danger" role="alert">
              Delivered product data could not be loaded.
            </AdminNotice>
          </div>
        ) : products.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No delivered products">
              Product rankings appear once suborders are delivered in this
              period.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-paper-soft">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-mute">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Product
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Units
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    Orders
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    Delivered value
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((product) => (
                  <tr key={product.key}>
                    <td className="max-w-[18rem] px-5 py-3">
                      <p className="truncate font-medium text-ink">
                        {product.name}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                      {product.units}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                      {product.orderCount}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-ink">
                      {formatEgp(product.revenueMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
