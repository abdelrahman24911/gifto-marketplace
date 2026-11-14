import type {
  CommissionStatus,
  OrderStatus,
} from "@/lib/supabase/database.types";

export type AdminAnalyticsRange = "7d" | "30d" | "90d";

export const ADMIN_ANALYTICS_RANGES: ReadonlyArray<{
  value: AdminAnalyticsRange;
  label: string;
}> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const RANGE_DAYS: Record<AdminAnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type AdminAnalyticsGranularity = "day" | "week";

export type AdminSeriesPoint = {
  key: string;
  label: string;
  value: number;
};

export type AdminStatusCounts = Record<OrderStatus, number>;

export type AdminOrderRecord = {
  id: string;
  status: OrderStatus;
  subtotal_minor: number;
  created_at: string;
};

export type AdminCommissionRecord = {
  id: string;
  vendor_id: string;
  status: CommissionStatus;
  amount_minor: number;
  base_minor: number;
  earned_at: string;
  reversed_at: string | null;
};

export type AdminShopLineRecord = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  status: OrderStatus;
  subtotal_minor: number;
  created_at: string;
};

export type AdminMarketplaceMetrics = {
  range: AdminAnalyticsRange;
  granularity: AdminAnalyticsGranularity;
  windowStart: string;
  windowEnd: string;
  totalOrders: number;
  statusCounts: AdminStatusCounts;
  gmvMinor: number;
  commissionEarnedMinor: number;
  averageOrderValueMinor: number;
  orderSeries: AdminSeriesPoint[];
  gmvSeries: AdminSeriesPoint[];
  commissionSeries: AdminSeriesPoint[];
};

export type AdminShopPerformance = {
  vendorId: string;
  name: string;
  grossMinor: number;
  deliveredMinor: number;
  lineCount: number;
  deliveredLineCount: number;
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

export function isAdminAnalyticsRange(
  value: string | undefined | null,
): value is AdminAnalyticsRange {
  return value === "7d" || value === "30d" || value === "90d";
}

export function parseAdminAnalyticsRange(
  value: string | undefined | null,
  fallback: AdminAnalyticsRange = "30d",
): AdminAnalyticsRange {
  return isAdminAnalyticsRange(value) ? value : fallback;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * DAY_MS);
}

function bucketStart(
  date: Date,
  granularity: AdminAnalyticsGranularity,
): Date {
  return granularity === "week" ? startOfUtcWeek(date) : startOfUtcDay(date);
}

function granularityFor(
  range: AdminAnalyticsRange,
): AdminAnalyticsGranularity {
  return range === "90d" ? "week" : "day";
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

function bucketKey(
  date: Date,
  granularity: AdminAnalyticsGranularity,
): string {
  return bucketStart(date, granularity).toISOString().slice(0, 10);
}

function bucketLabel(
  key: string,
  granularity: AdminAnalyticsGranularity,
): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  const month = MONTHS[date.getUTCMonth()];
  if (granularity === "week") return `Week of ${date.getUTCDate()} ${month}`;
  return `${date.getUTCDate()} ${month}`;
}

export function adminAnalyticsWindowStart(
  range: AdminAnalyticsRange,
  now: Date = new Date(),
): Date {
  return startOfUtcDay(
    new Date(now.getTime() - (RANGE_DAYS[range] - 1) * DAY_MS),
  );
}

function generateBuckets(
  start: Date,
  end: Date,
  granularity: AdminAnalyticsGranularity,
): Date[] {
  const buckets: Date[] = [];
  let cursor = bucketStart(start, granularity);
  const endKey = bucketStart(end, granularity).getTime();

  for (let guard = 0; guard < 256; guard += 1) {
    buckets.push(new Date(cursor));
    if (cursor.getTime() >= endKey) break;
    cursor = new Date(
      cursor.getTime() +
        (granularity === "week" ? 7 * DAY_MS : DAY_MS),
    );
  }

  return buckets;
}

function emptyStatusCounts(): AdminStatusCounts {
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

function uniqueById<T extends { id: string }>(rows: readonly T[]): T[] {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

function seriesFromCounts(
  buckets: Date[],
  counts: ReadonlyMap<string, number>,
  granularity: AdminAnalyticsGranularity,
): AdminSeriesPoint[] {
  return buckets.map((bucket) => {
    const key = bucket.toISOString().slice(0, 10);
    return {
      key,
      label: bucketLabel(key, granularity),
      value: counts.get(key) ?? 0,
    };
  });
}

export function computeAdminMarketplaceMetrics(
  orders: readonly AdminOrderRecord[],
  commissionEntries: readonly AdminCommissionRecord[],
  range: AdminAnalyticsRange,
  now: Date = new Date(),
): AdminMarketplaceMetrics {
  const granularity = granularityFor(range);
  const requestedStart = adminAnalyticsWindowStart(range, now);
  const windowEnd = now;
  const statusCounts = emptyStatusCounts();
  const orderCountByBucket = new Map<string, number>();
  const gmvByBucket = new Map<string, number>();
  const commissionByBucket = new Map<string, number>();

  let gmvMinor = 0;
  let totalOrders = 0;

  for (const order of uniqueById(orders)) {
    const createdAt = parseDate(order.created_at);
    if (
      !createdAt ||
      createdAt.getTime() < requestedStart.getTime() ||
      createdAt.getTime() > windowEnd.getTime()
    ) {
      continue;
    }

    const subtotal = Number.isFinite(order.subtotal_minor)
      ? order.subtotal_minor
      : 0;
    totalOrders += 1;
    gmvMinor += subtotal;

    if (order.status in statusCounts) {
      statusCounts[order.status] += 1;
    }

    const key = bucketKey(createdAt, granularity);
    orderCountByBucket.set(key, (orderCountByBucket.get(key) ?? 0) + 1);
    gmvByBucket.set(key, (gmvByBucket.get(key) ?? 0) + subtotal);
  }

  let commissionEarnedMinor = 0;

  for (const entry of uniqueById(commissionEntries)) {
    if (entry.status !== "earned") continue;

    const earnedAt = parseDate(entry.earned_at);
    if (
      !earnedAt ||
      earnedAt.getTime() < requestedStart.getTime() ||
      earnedAt.getTime() > windowEnd.getTime()
    ) {
      continue;
    }

    const amount = Number.isFinite(entry.amount_minor)
      ? entry.amount_minor
      : 0;
    commissionEarnedMinor += amount;

    const key = bucketKey(earnedAt, granularity);
    commissionByBucket.set(
      key,
      (commissionByBucket.get(key) ?? 0) + amount,
    );
  }

  const buckets = generateBuckets(requestedStart, windowEnd, granularity);

  return {
    range,
    granularity,
    windowStart: requestedStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalOrders,
    statusCounts,
    gmvMinor,
    commissionEarnedMinor,
    averageOrderValueMinor:
      totalOrders > 0 ? Math.round(gmvMinor / totalOrders) : 0,
    orderSeries: seriesFromCounts(
      buckets,
      orderCountByBucket,
      granularity,
    ),
    gmvSeries: seriesFromCounts(buckets, gmvByBucket, granularity),
    commissionSeries: seriesFromCounts(
      buckets,
      commissionByBucket,
      granularity,
    ),
  };
}

export function computeAdminShopPerformance(
  lines: readonly AdminShopLineRecord[],
  range: AdminAnalyticsRange,
  now: Date = new Date(),
): AdminShopPerformance[] {
  const windowStart = adminAnalyticsWindowStart(range, now);
  const shops = new Map<string, AdminShopPerformance>();

  for (const line of uniqueById(lines)) {
    const createdAt = parseDate(line.created_at);
    if (
      !createdAt ||
      createdAt.getTime() < windowStart.getTime() ||
      createdAt.getTime() > now.getTime()
    ) {
      continue;
    }

    const subtotal = Number.isFinite(line.subtotal_minor)
      ? line.subtotal_minor
      : 0;
    const current = shops.get(line.vendor_id) ?? {
      vendorId: line.vendor_id,
      name: line.vendor_name,
      grossMinor: 0,
      deliveredMinor: 0,
      lineCount: 0,
      deliveredLineCount: 0,
    };

    current.grossMinor += subtotal;
    current.lineCount += 1;

    if (line.status === "delivered") {
      current.deliveredMinor += subtotal;
      current.deliveredLineCount += 1;
    }

    shops.set(line.vendor_id, current);
  }

  return Array.from(shops.values()).sort(
    (a, b) =>
      b.grossMinor - a.grossMinor ||
      b.deliveredMinor - a.deliveredMinor ||
      a.name.localeCompare(b.name),
  );
}

export function sumAdminSeries(points: readonly AdminSeriesPoint[]): number {
  return points.reduce((total, point) => total + point.value, 0);
}
