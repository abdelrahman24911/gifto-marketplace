import {
  businessDateFromKey,
  businessDateKey,
  startOfBusinessDayOffset,
  startOfBusinessMonth,
} from "@/lib/business-time";

import type { OrderStatus } from "@/lib/supabase/database.types";

/**
 * Vendor sales analytics.
 *
 * Definitions are deliberately conservative and match the finance ledger:
 * - "Recognised revenue" is the subtotal of delivered shop lines only.
 * - "Gross sales" is every shop line placed in the window, whatever happened
 *   to it afterwards, so the reconciliation panel can explain the difference.
 * - Open lines (placed/confirmed/shipped) are pipeline, never revenue.
 * - Cancelled and returned lines are excluded from revenue.
 *
 * All arithmetic is integer minor units. Suborders are deduplicated by id before
 * aggregation so a joined `order_items` row can never double-count a suborder.
 */

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

export const ANALYTICS_RANGES: ReadonlyArray<{
  value: AnalyticsRange;
  label: string;
}> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "Latest 1,000" },
];

/**
 * PostgREST reads must stay bounded. The all-time view intentionally loads the
 * most recent shop lines only and labels itself accordingly; date-bound ranges
 * use an indexed window instead.
 */
export const ANALYTICS_ALL_TIME_ROW_LIMIT = 1_000;

export function analyticsQueryLimit(range: AnalyticsRange): number | null {
  return range === "all" ? ANALYTICS_ALL_TIME_ROW_LIMIT : null;
}

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type AnalyticsGranularity = "day" | "week" | "month";

export type AnalyticsItem = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  line_total_minor: number;
};

export type AnalyticsSuborder = {
  id: string;
  status: OrderStatus;
  subtotal_minor: number;
  created_at: string;
  delivered_at: string | null;
  order_items?: AnalyticsItem[] | null;
};

export type AnalyticsSeriesPoint = {
  key: string;
  label: string;
  value: number;
};

export type AnalyticsBestSeller = {
  key: string;
  name: string;
  units: number;
  revenueMinor: number;
  orders: number;
};

export type VendorAnalytics = {
  range: AnalyticsRange;
  granularity: AnalyticsGranularity;
  windowStart: string;
  windowEnd: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  openOrders: number;
  grossSalesMinor: number;
  revenueMinor: number;
  cancelledMinor: number;
  returnedMinor: number;
  openMinor: number;
  averageOrderValueMinor: number;
  revenueSeries: AnalyticsSeriesPoint[];
  orderSeries: AnalyticsSeriesPoint[];
  bestSellers: AnalyticsBestSeller[];
  statusCounts: Record<OrderStatus, number>;
};

const DAY_MS = 86_400_000;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function isAnalyticsRange(
  value: string | undefined | null,
): value is AnalyticsRange {
  return (
    value === "7d" || value === "30d" || value === "90d" || value === "all"
  );
}

function dateFromKey(key: string): Date {
  const parts = businessDateFromKey(key);
  if (!parts) return new Date(Number.NaN);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function keyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function granularityFor(range: AnalyticsRange): AnalyticsGranularity {
  if (range === "90d") return "week";
  if (range === "all") return "month";
  return "day";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

function bucketStartKey(key: string, granularity: AnalyticsGranularity) {
  if (granularity === "day") return key;
  if (granularity === "month") return `${key.slice(0, 7)}-01`;

  const date = dateFromKey(key);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return keyFromDate(new Date(date.getTime() - daysSinceMonday * DAY_MS));
}

function bucketKey(date: Date, granularity: AnalyticsGranularity): string {
  return bucketStartKey(businessDateKey(date), granularity);
}

function bucketLabel(
  key: string,
  granularity: AnalyticsGranularity,
): string {
  const date = dateFromKey(key);
  const month = MONTHS[date.getUTCMonth()];
  if (granularity === "month") return `${month} ${date.getUTCFullYear()}`;
  if (granularity === "week") return `Week of ${date.getUTCDate()} ${month}`;
  return `${date.getUTCDate()} ${month}`;
}

/**
 * Start of the requested window, or null for the all-time option. All-time
 * callers must also apply `analyticsQueryLimit` so the database read is
 * bounded; the window then starts at the oldest row returned.
 */
export function analyticsWindowStart(
  range: AnalyticsRange,
  now: Date = new Date(),
): Date | null {
  if (range === "all") return null;
  return startOfBusinessDayOffset(now, RANGE_DAYS[range] - 1);
}

function generateBuckets(
  start: Date,
  end: Date,
  granularity: AnalyticsGranularity,
): string[] {
  const buckets: string[] = [];
  let cursor = dateFromKey(
    bucketStartKey(businessDateKey(start), granularity),
  );
  const endTime = dateFromKey(
    bucketStartKey(businessDateKey(end), granularity),
  ).getTime();

  for (let guard = 0; guard < 2_000; guard += 1) {
    buckets.push(keyFromDate(cursor));
    if (cursor.getTime() >= endTime) break;

    if (granularity === "day") {
      cursor = new Date(cursor.getTime() + DAY_MS);
    } else if (granularity === "week") {
      cursor = new Date(cursor.getTime() + 7 * DAY_MS);
    } else {
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
    }
  }

  return buckets;
}

function emptyStatusCounts(): Record<OrderStatus, number> {
  return {
    placed: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
    partially_completed: 0,
  };
}

export function computeVendorAnalytics(
  suborders: AnalyticsSuborder[],
  range: AnalyticsRange,
  now: Date = new Date(),
): VendorAnalytics {
  const granularity = granularityFor(range);
  const unique = Array.from(
    new Map(suborders.map((suborder) => [suborder.id, suborder])).values(),
  ).flatMap((suborder) => {
    const createdAt = parseDate(suborder.created_at);
    if (!createdAt) return [];
    return [{ suborder, createdAt }];
  });

  const requestedStart = analyticsWindowStart(range, now);
  const oldestCreated = unique.reduce<Date | null>(
    (oldest, row) =>
      oldest && oldest.getTime() <= row.createdAt.getTime()
        ? oldest
        : row.createdAt,
    null,
  );

  const windowStart =
    requestedStart ?? startOfBusinessMonth(oldestCreated ?? now);

  const rows = unique.filter(
    (row) => row.createdAt.getTime() >= windowStart.getTime(),
  );

  const statusCounts = emptyStatusCounts();
  let grossSalesMinor = 0;
  let revenueMinor = 0;
  let cancelledMinor = 0;
  let returnedMinor = 0;
  let openMinor = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let returnedOrders = 0;
  let openOrders = 0;
  let latestActivity = now;

  const orderCounts = new Map<string, number>();
  const revenueCounts = new Map<string, number>();
  const bestSellerMap = new Map<
    string,
    { name: string; units: number; revenueMinor: number; orders: Set<string> }
  >();

  for (const { suborder, createdAt } of rows) {
    const subtotal = Number.isFinite(suborder.subtotal_minor)
      ? suborder.subtotal_minor
      : 0;
    grossSalesMinor += subtotal;

    if (suborder.status in statusCounts) {
      statusCounts[suborder.status] += 1;
    }

    if (createdAt.getTime() > latestActivity.getTime()) {
      latestActivity = createdAt;
    }

    const orderKey = bucketKey(createdAt, granularity);
    orderCounts.set(orderKey, (orderCounts.get(orderKey) ?? 0) + 1);

    if (suborder.status === "delivered") {
      revenueMinor += subtotal;
      completedOrders += 1;

      const deliveredAt = parseDate(suborder.delivered_at) ?? createdAt;
      if (deliveredAt.getTime() > latestActivity.getTime()) {
        latestActivity = deliveredAt;
      }
      const revenueKey = bucketKey(deliveredAt, granularity);
      revenueCounts.set(
        revenueKey,
        (revenueCounts.get(revenueKey) ?? 0) + subtotal,
      );

      for (const item of suborder.order_items ?? []) {
        const name = item.product_name?.trim() || "Unknown item";
        const key = item.product_id ?? `name:${name.toLowerCase()}`;
        const current = bestSellerMap.get(key) ?? {
          name,
          units: 0,
          revenueMinor: 0,
          orders: new Set<string>(),
        };
        current.units += Number.isFinite(item.quantity) ? item.quantity : 0;
        current.revenueMinor += Number.isFinite(item.line_total_minor)
          ? item.line_total_minor
          : 0;
        current.orders.add(suborder.id);
        bestSellerMap.set(key, current);
      }
    } else if (suborder.status === "cancelled") {
      cancelledMinor += subtotal;
      cancelledOrders += 1;
    } else if (suborder.status === "returned") {
      returnedMinor += subtotal;
      returnedOrders += 1;
    } else {
      openMinor += subtotal;
      openOrders += 1;
    }
  }

  const buckets = generateBuckets(windowStart, latestActivity, granularity);

  const revenueSeries = buckets.map((key) => ({
    key,
    label: bucketLabel(key, granularity),
    value: revenueCounts.get(key) ?? 0,
  }));

  const orderSeries = buckets.map((key) => ({
    key,
    label: bucketLabel(key, granularity),
    value: orderCounts.get(key) ?? 0,
  }));

  const bestSellers = Array.from(bestSellerMap.entries())
    .map(([key, value]) => ({
      key,
      name: value.name,
      units: value.units,
      revenueMinor: value.revenueMinor,
      orders: value.orders.size,
    }))
    .sort(
      (a, b) =>
        b.units - a.units ||
        b.revenueMinor - a.revenueMinor ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 8);

  return {
    range,
    granularity,
    windowStart: windowStart.toISOString(),
    windowEnd: latestActivity.toISOString(),
    totalOrders: rows.length,
    completedOrders,
    cancelledOrders,
    returnedOrders,
    openOrders,
    grossSalesMinor,
    revenueMinor,
    cancelledMinor,
    returnedMinor,
    openMinor,
    averageOrderValueMinor:
      completedOrders > 0 ? Math.round(revenueMinor / completedOrders) : 0,
    revenueSeries,
    orderSeries,
    bestSellers,
    statusCounts,
  };
}

/** Sums a series so the UI/test suite can prove it reconciles with totals. */
export function sumSeries(points: AnalyticsSeriesPoint[]): number {
  return points.reduce((total, point) => total + point.value, 0);
}
