import Link from "next/link";

import { BarChart } from "@/components/bar-chart";
import { DashboardIcon } from "@/components/dashboard/icons";
import {
  BUSINESS_TIME_ZONE,
  businessDayWindow,
} from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";
import { totalsForEntries } from "@/lib/finance";
import { formatEgp } from "@/lib/money";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  type OrderStatus,
} from "@/lib/orders";
import {
  analyticsWindowStart,
  computeVendorAnalytics,
  type AnalyticsSuborder,
} from "@/lib/vendor-analytics";
import { requireVendorRole } from "@/lib/vendor";

import {
  VendorActionLink,
  VendorEmpty,
  VendorNotice,
  VendorPageHeader,
  VendorSectionHeading,
  VendorStatStrip,
} from "../ui";

export const metadata = { title: "Shop overview — Gifto" };

const LOW_STOCK_THRESHOLD = 5;

const ATTENTION_STATUSES: OrderStatus[] = ["placed", "confirmed", "shipped"];

const REASON_LABELS: Record<string, string> = {
  order_placed: "Order placed",
  order_cancelled: "Order cancelled",
  manual_adjustment: "Manual adjustment",
};

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
const BUSINESS_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: BUSINESS_TIME_ZONE,
});

type CommissionRow = {
  status: "earned" | "reversed";
  base_minor: number;
  amount_minor: number;
};

type OrderSummary =
  | {
      public_reference: string | null;
      recipient_name: string | null;
    }
  | {
      public_reference: string | null;
      recipient_name: string | null;
    }[]
  | null;

type SuborderRow = {
  id: string;
  status: OrderStatus;
  subtotal_minor: number;
  created_at: string;
  order: OrderSummary;
};

type LowStockRow = {
  id: string;
  name: string;
  stock: number;
};

type MovementRow = {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  created_at: string;
  product:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

function orderSummary(order: OrderSummary) {
  return Array.isArray(order) ? (order[0] ?? null) : order;
}

function orderRef(row: SuborderRow) {
  const order = orderSummary(row.order);
  return order?.public_reference ?? `#${row.id.slice(0, 8)}`;
}

function timeAgo(value: string, now: Date) {
  const difference = Date.parse(value) - now.getTime();
  const absolute = Math.abs(difference);

  if (Number.isNaN(difference)) return "Date unavailable";
  if (absolute < 60_000) return "just now";
  if (absolute < 3_600_000) {
    return RELATIVE.format(Math.round(difference / 60_000), "minute");
  }
  if (absolute < 86_400_000) {
    return RELATIVE.format(Math.round(difference / 3_600_000), "hour");
  }
  return RELATIVE.format(Math.round(difference / 86_400_000), "day");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export default async function VendorOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const now = new Date();
  const today = businessDayWindow(now);
  const analyticsStart = analyticsWindowStart("30d", now)!;

  const countStatus = (status: OrderStatus) =>
    supabase
      .from("order_vendors")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", access.vendorId)
      .eq("status", status);

  const [
    todayResult,
    placedResult,
    confirmedResult,
    shippedResult,
    deliveredResult,
    analyticsResult,
    financeResult,
    attentionResult,
    recentResult,
    lowStockResult,
    movementsResult,
  ] = await Promise.all([
    fetchAllRows<{ subtotal_minor: number }>((from, to) =>
      supabase
        .from("order_vendors")
        .select("subtotal_minor")
        .eq("vendor_id", access.vendorId)
        .gte("created_at", today.start.toISOString())
        .lt("created_at", today.end.toISOString())
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<{ subtotal_minor: number }[]>(),
    ),
    countStatus("placed"),
    countStatus("confirmed"),
    countStatus("shipped"),
    countStatus("delivered"),
    fetchAllRows<AnalyticsSuborder>((from, to) =>
      supabase
        .from("order_vendors")
        .select(
          "id, status, subtotal_minor, created_at, delivered_at, order_items(product_id, product_name, quantity, line_total_minor)",
        )
        .eq("vendor_id", access.vendorId)
        .or(
          `created_at.gte.${analyticsStart.toISOString()},delivered_at.gte.${analyticsStart.toISOString()}`,
        )
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<AnalyticsSuborder[]>(),
    ),
    fetchAllRows<CommissionRow>((from, to) =>
      supabase
        .from("commission_entries")
        .select("status, base_minor, amount_minor")
        .eq("vendor_id", access.vendorId)
        .order("earned_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<CommissionRow[]>(),
    ),
    supabase
      .from("order_vendors")
      .select(
        "id, status, subtotal_minor, created_at, order:orders(public_reference, recipient_name)",
      )
      .eq("vendor_id", access.vendorId)
      .in("status", ATTENTION_STATUSES)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(5)
      .returns<SuborderRow[]>(),
    supabase
      .from("order_vendors")
      .select(
        "id, status, subtotal_minor, created_at, order:orders(public_reference, recipient_name)",
      )
      .eq("vendor_id", access.vendorId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(6)
      .returns<SuborderRow[]>(),
    supabase
      .from("products")
      .select("id, name, stock")
      .eq("vendor_id", access.vendorId)
      .eq("status", "active")
      .lte("stock", LOW_STOCK_THRESHOLD)
      .order("stock", { ascending: true })
      .order("name", { ascending: true })
      .limit(6)
      .returns<LowStockRow[]>(),
    supabase
      .from("inventory_movements")
      .select(
        "id, delta, reason, note, created_at, product:products!inner(id, name, vendor_id)",
      )
      .eq("product.vendor_id", access.vendorId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(6)
      .returns<MovementRow[]>(),
  ]);

  const analytics = computeVendorAnalytics(
    analyticsResult.rows,
    "30d",
    now,
  );
  const analyticsIncomplete =
    analyticsResult.failed || analyticsResult.truncated;

  const earnedFinance = totalsForEntries(
    financeResult.rows.filter((entry) => entry.status === "earned"),
  );
  const financeIncomplete = financeResult.failed || financeResult.truncated;

  const todayComplete = !todayResult.failed && !todayResult.truncated;
  const todayOrders = todayResult.failed ? null : todayResult.rows.length;
  const todayGross = todayResult.failed
    ? null
    : todayResult.rows.reduce(
        (total, row) => total + row.subtotal_minor,
        0,
      );

  const countsFailed = [
    placedResult.error,
    confirmedResult.error,
    shippedResult.error,
    deliveredResult.error,
  ].some(Boolean);

  const counts = {
    placed: placedResult.count ?? 0,
    confirmed: confirmedResult.count ?? 0,
    shipped: shippedResult.count ?? 0,
    delivered: deliveredResult.count ?? 0,
  };
  const actionable = counts.placed + counts.confirmed + counts.shipped;
  const processing = counts.confirmed + counts.shipped;

  const loadError =
    countsFailed ||
    analyticsResult.failed ||
    financeResult.failed ||
    todayResult.failed ||
    attentionResult.error ||
    recentResult.error ||
    lowStockResult.error ||
    movementsResult.error;

  const attentionOrders = attentionResult.data ?? [];
  const recentOrders = recentResult.data ?? [];
  const lowStock = lowStockResult.data ?? [];
  const movements = movementsResult.data ?? [];

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
        eyebrow={`Shop pulse · ${BUSINESS_DAY.format(now)} · Cairo`}
        title="Overview"
        description={
          <>
            A working view of {access.vendorName}: orders waiting on you,
            delivered revenue, and the stock that needs attention. You are
            signed in as {access.role}.
          </>
        }
        actions={
          <>
            <VendorActionLink href={`/shops/${access.vendorSlug}`}>
              View public shop
            </VendorActionLink>
            {canManage ? (
              <VendorActionLink
                href={`/vendor/products/new?vendor=${access.vendorId}`}
                primary
              >
                Add a product
              </VendorActionLink>
            ) : (
              <VendorActionLink
                href={`/vendor/orders?vendor=${access.vendorId}`}
                primary
              >
                Review orders
              </VendorActionLink>
            )}
          </>
        }
      />

      {loadError || analyticsIncomplete || financeIncomplete ? (
        <div className="mt-4">
          <VendorNotice tone="warning" role="alert">
            Part of this overview could not be read in full. Figures marked
            with a dash or labelled partial are not exact. Refresh the page to
            try again.
          </VendorNotice>
        </div>
      ) : null}

      {!canManage ? (
        <div className="mt-4">
          <VendorNotice tone="info">
            Staff access is read-only. Owners and managers can change orders,
            products, inventory and settings.
          </VendorNotice>
        </div>
      ) : null}

      <div className="mt-6">
        <VendorStatStrip
          items={[
            {
              label: "Today's orders",
              value: todayOrders === null ? "—" : todayOrders,
              hint:
                todayGross === null
                  ? "Placed value unavailable"
                  : `${formatEgp(todayGross)} placed${todayComplete ? "" : " · partial"}`,
              emphasis: "accent",
            },
            {
              label: "Waiting to confirm",
              value: countsFailed ? "—" : counts.placed,
              hint: "Oldest first in your queue",
              emphasis: counts.placed > 0 ? "warning" : "default",
            },
            {
              label: "In progress",
              value: countsFailed ? "—" : processing,
              hint: `${counts.confirmed} confirmed · ${counts.shipped} shipped`,
            },
            {
              label: "Delivered",
              value: countsFailed ? "—" : counts.delivered,
              hint: "All time",
              emphasis: "positive",
            },
          ]}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <VendorSectionHeading
            title="Delivered revenue"
            description={
              analyticsResult.failed ? (
                "Revenue could not be loaded"
              ) : (
                <>
                  <span className="font-medium text-ink">
                    {formatEgp(analytics.revenueMinor)}
                  </span>{" "}
                  across {analytics.completedOrders}{" "}
                  {analytics.completedOrders === 1 ? "line" : "lines"} · last
                  30 Cairo days
                </>
              )
            }
            href={`/vendor/analytics?vendor=${access.vendorId}`}
            linkLabel="Open analytics"
          />
          {analyticsResult.failed ? (
            <div className="mt-4">
              <VendorNotice tone="danger" role="alert">
                Delivered revenue is unavailable right now.
              </VendorNotice>
            </div>
          ) : (
            <BarChart
              points={analytics.revenueSeries}
              formatValue={formatEgp}
              ariaLabel="Delivered revenue by day for the last 30 Cairo days"
              emptyLabel="No delivered revenue in the last 30 days."
              tone="berry"
            />
          )}
        </section>

        <section className="rounded-2xl border border-berry/20 bg-berry-soft p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-berry-deep">
                Needs you
              </p>
              <p className="mt-2 font-display text-4xl leading-none tabular-nums text-ink">
                {countsFailed ? "—" : actionable}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                open shop lines waiting to move forward
              </p>
            </div>
            <Link
              href={`/vendor/orders?vendor=${access.vendorId}&status=open`}
              className="rounded-full border border-berry/25 bg-paper/80 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-berry/50 hover:bg-paper"
            >
              Open queue
            </Link>
          </div>

          {attentionResult.error ? (
            <p className="mt-4 text-xs text-ink-soft">
              The action queue could not be loaded.
            </p>
          ) : attentionOrders.length === 0 ? (
            <p className="mt-4 rounded-xl border border-berry/15 bg-paper/70 px-3 py-3 text-sm text-ink-soft">
              Nothing is waiting. Every placed order has been moved forward.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {attentionOrders.map((suborder) => {
                const order = orderSummary(suborder.order);
                return (
                  <li key={suborder.id}>
                    <Link
                      href={`/vendor/orders?vendor=${access.vendorId}&status=${suborder.status}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-berry/15 bg-paper/70 px-3 py-2.5 transition-colors hover:border-berry/35 hover:bg-paper"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                          {orderRef(suborder)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-mute">
                          {order?.recipient_name ?? "Customer"} ·{" "}
                          {timeAgo(suborder.created_at, now)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={`block rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${ORDER_STATUS_STYLES[suborder.status]}`}
                        >
                          {ORDER_STATUS_LABELS[suborder.status]}
                        </span>
                        <span className="mt-1 block text-xs tabular-nums text-ink-soft">
                          {formatEgp(suborder.subtotal_minor)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8">
        <VendorSectionHeading
          title="Money on the books"
          description="Commission snapshots from delivered shop lines only; reversed entries are excluded."
          href={`/vendor/finance?vendor=${access.vendorId}`}
          linkLabel="Open finance"
        />
        <div className="mt-4 grid overflow-hidden rounded-2xl border border-line bg-paper-soft md:grid-cols-[1.15fr_1fr_1fr]">
          <div className="bg-wine p-5 text-paper">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-paper/55">
              Net earnings
            </p>
            <p className="mt-2 font-display text-4xl leading-none tabular-nums">
              {financeResult.failed ? "—" : formatEgp(earnedFinance.netMinor)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-paper/65">
              After Gifto commission · {earnedFinance.count} delivered{" "}
              {earnedFinance.count === 1 ? "line" : "lines"}
            </p>
          </div>
          <div className="border-b border-line p-5 md:border-b-0 md:border-r">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-mute">
              Delivered gross
            </p>
            <p className="mt-2 font-display text-3xl leading-none tabular-nums text-ink">
              {financeResult.failed ? "—" : formatEgp(earnedFinance.grossMinor)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-mute">
              Shop-line value before commission
            </p>
          </div>
          <div className="p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-ink-mute">
              Gifto commission
            </p>
            <p className="mt-2 font-display text-3xl leading-none tabular-nums text-ink">
              {financeResult.failed
                ? "—"
                : formatEgp(earnedFinance.commissionMinor)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-mute">
              {financeIncomplete ? "Ledger read is partial" : "Rate frozen at order time"}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <VendorSectionHeading
            title="Latest orders"
            description="Newest shop lines, whatever their status"
            href={`/vendor/orders?vendor=${access.vendorId}`}
            linkLabel="All orders"
          />
          {recentResult.error ? (
            <div className="mt-4">
              <VendorNotice tone="danger" role="alert">
                Recent orders could not be loaded.
              </VendorNotice>
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="mt-4">
              <VendorEmpty title="No orders yet">
                Your first shop line will appear here as soon as a customer
                checks out.
              </VendorEmpty>
            </div>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
              {recentOrders.map((suborder) => {
                const order = orderSummary(suborder.order);
                return (
                  <li
                    key={suborder.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {orderRef(suborder)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-mute">
                        {order?.recipient_name ?? "Customer"} ·{" "}
                        {formatDateTime(suborder.created_at)} ·{" "}
                        {timeAgo(suborder.created_at, now)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${ORDER_STATUS_STYLES[suborder.status]}`}
                      >
                        {ORDER_STATUS_LABELS[suborder.status]}
                      </span>
                      <span className="text-sm tabular-nums text-ink">
                        {formatEgp(suborder.subtotal_minor)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <VendorSectionHeading
            title="Order mix"
            description="Share of shop lines placed in the last 30 days"
          />
          {analyticsResult.failed ? (
            <p className="mt-4 text-sm text-ink-soft">
              Status breakdown unavailable.
            </p>
          ) : statusRows.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-paper px-4 py-8 text-center text-sm text-ink-soft">
              No shop lines in this period.
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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <VendorSectionHeading
            title="Best sellers"
            description="Units and delivered value from the last 30 days"
            href={`/vendor/analytics?vendor=${access.vendorId}`}
            linkLabel="See performance"
          />
          {analyticsResult.failed ? (
            <div className="mt-4">
              <VendorNotice tone="danger" role="alert">
                Best sellers could not be loaded.
              </VendorNotice>
            </div>
          ) : analytics.bestSellers.length === 0 ? (
            <div className="mt-4">
              <VendorEmpty title="No delivered items yet">
                Best sellers appear after shop lines are delivered.
              </VendorEmpty>
            </div>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
              {analytics.bestSellers.slice(0, 5).map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-5"
                >
                  <div className="min-w-0">
                    {item.key.startsWith("name:") ? (
                      <p className="truncate text-sm font-medium text-ink">
                        {item.name}
                      </p>
                    ) : (
                      <Link
                        href={`/vendor/products/${item.key}?vendor=${access.vendorId}`}
                        className="block truncate text-sm font-medium text-ink underline decoration-line-strong underline-offset-2 hover:text-berry"
                      >
                        {item.name}
                      </Link>
                    )}
                    <p className="mt-0.5 text-xs text-ink-mute">
                      {item.units} {item.units === 1 ? "unit" : "units"} ·{" "}
                      {item.orders} {item.orders === 1 ? "order" : "orders"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-ink">
                    {formatEgp(item.revenueMinor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <VendorSectionHeading
            title="Low stock"
            description={`Active gifts at ${LOW_STOCK_THRESHOLD} units or fewer`}
            href={`/vendor/inventory?vendor=${access.vendorId}`}
            linkLabel="Manage inventory"
          />
          {lowStockResult.error ? (
            <div className="mt-4">
              <VendorNotice tone="danger" role="alert">
                Low-stock alerts could not be loaded.
              </VendorNotice>
            </div>
          ) : lowStock.length === 0 ? (
            <div className="mt-4">
              <VendorEmpty title="Stock looks healthy">
                No active gift is at or below {LOW_STOCK_THRESHOLD} units.
              </VendorEmpty>
            </div>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
              {lowStock.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {product.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-mute">
                      Active listing
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        product.stock <= 0
                          ? "border-red-200 bg-red-50 text-red-800"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {product.stock <= 0 ? "Out of stock" : `${product.stock} left`}
                    </span>
                    {canManage ? (
                      <Link
                        href={`/vendor/products/${product.id}/inventory?vendor=${access.vendorId}`}
                        className="text-sm font-medium text-berry hover:text-berry-deep"
                      >
                        Adjust
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <VendorSectionHeading
            title="Recent stock movements"
            description="The audit trail behind your current stock"
            href={`/vendor/inventory?vendor=${access.vendorId}`}
            linkLabel="All inventory"
          />
          {movementsResult.error ? (
            <div className="mt-4">
              <VendorNotice tone="danger" role="alert">
                Stock movements could not be loaded.
              </VendorNotice>
            </div>
          ) : movements.length === 0 ? (
            <div className="mt-4">
              <VendorEmpty title="No stock movements yet">
                Orders, cancellations and manual adjustments will be recorded
                here.
              </VendorEmpty>
            </div>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
              {movements.map((movement) => {
                const product = Array.isArray(movement.product)
                  ? movement.product[0]
                  : movement.product;
                return (
                  <li
                    key={movement.id}
                    className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {product?.name ?? "Product"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-mute">
                        {REASON_LABELS[movement.reason] ?? movement.reason} ·{" "}
                        {formatDateTime(movement.created_at)}
                        {movement.note ? ` · ${movement.note}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        movement.delta >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {movement.delta >= 0 ? `+${movement.delta}` : movement.delta}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-paper-soft p-5">
          <VendorSectionHeading
            title="Quick actions"
            description="The next practical moves for this shop"
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {[
              {
                href: `/vendor/orders?vendor=${access.vendorId}&status=open`,
                label: "Work the order queue",
                detail: `${countsFailed ? "Open" : actionable} lines need attention`,
                icon: "orders" as const,
              },
              {
                href: `/vendor/products/new?vendor=${access.vendorId}`,
                label: canManage ? "Add a product" : "Browse products",
                detail: canManage
                  ? "Grow the collection"
                  : "Staff view is read-only",
                icon: "products" as const,
              },
              {
                href: `/vendor/inventory?vendor=${access.vendorId}`,
                label: "Check inventory",
                detail: `${lowStock.length} low-stock ${lowStock.length === 1 ? "listing" : "listings"}`,
                icon: "inventory" as const,
              },
              {
                href: `/vendor/finance?vendor=${access.vendorId}`,
                label: "Review earnings",
                detail: "Commission and settlements",
                icon: "earnings" as const,
              },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3.5 py-3 transition-colors hover:border-berry/30 hover:bg-berry-soft/50"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-berry-soft text-berry-deep">
                  <DashboardIcon name={action.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {action.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-mute">
                    {action.detail}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
