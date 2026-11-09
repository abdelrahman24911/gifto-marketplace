import { describe, expect, it } from "vitest";

import {
  ANALYTICS_ALL_TIME_ROW_LIMIT,
  analyticsQueryLimit,
  analyticsWindowStart,
  computeVendorAnalytics,
  isAnalyticsRange,
  sumSeries,
  type AnalyticsRange,
  type AnalyticsSuborder,
} from "@/lib/vendor-analytics";

const NOW = new Date("2026-11-06T12:00:00.000Z");

function suborder(
  overrides: Partial<AnalyticsSuborder> & Pick<AnalyticsSuborder, "id">,
): AnalyticsSuborder {
  return {
    status: "placed",
    subtotal_minor: 0,
    created_at: "2026-11-01T09:00:00.000Z",
    delivered_at: null,
    order_items: null,
    ...overrides,
  };
}

const deliveredOne = suborder({
  id: "sub-1",
  status: "delivered",
  subtotal_minor: 10_000,
  created_at: "2026-11-01T09:00:00.000Z",
  delivered_at: "2026-11-05T14:00:00.000Z",
  order_items: [
    {
      product_id: "product-a",
      product_name: "Rose box",
      quantity: 2,
      line_total_minor: 6_000,
    },
    {
      product_id: "product-b",
      product_name: "Chocolate",
      quantity: 1,
      line_total_minor: 4_000,
    },
  ],
});

const deliveredTwo = suborder({
  id: "sub-2",
  status: "delivered",
  subtotal_minor: 5_000,
  created_at: "2026-11-06T08:00:00.000Z",
  delivered_at: "2026-11-06T10:00:00.000Z",
  order_items: [
    {
      product_id: "product-a",
      product_name: "Rose box",
      quantity: 1,
      line_total_minor: 5_000,
    },
  ],
});

const shipped = suborder({
  id: "sub-3",
  status: "shipped",
  subtotal_minor: 3_000,
  created_at: "2026-11-04T09:00:00.000Z",
});

const cancelled = suborder({
  id: "sub-4",
  status: "cancelled",
  subtotal_minor: 2_000,
  created_at: "2026-11-02T09:00:00.000Z",
});

const returned = suborder({
  id: "sub-5",
  status: "returned",
  subtotal_minor: 2_000,
  created_at: "2026-10-20T09:00:00.000Z",
  delivered_at: "2026-10-22T09:00:00.000Z",
});

const oldDelivered = suborder({
  id: "sub-6",
  status: "delivered",
  subtotal_minor: 7_000,
  created_at: "2026-09-01T09:00:00.000Z",
  delivered_at: "2026-09-03T09:00:00.000Z",
  order_items: [
    {
      product_id: "product-c",
      product_name: "Candle",
      quantity: 1,
      line_total_minor: 7_000,
    },
  ],
});

const ALL = [
  deliveredOne,
  deliveredTwo,
  shipped,
  cancelled,
  returned,
  oldDelivered,
];

describe("computeVendorAnalytics", () => {
  it("recognises only delivered revenue in the last 7 days", () => {
    const result = computeVendorAnalytics(ALL, "7d", NOW);

    expect(result.totalOrders).toBe(4);
    expect(result.completedOrders).toBe(2);
    expect(result.openOrders).toBe(1);
    expect(result.cancelledOrders).toBe(1);
    expect(result.returnedOrders).toBe(0);
    expect(result.grossSalesMinor).toBe(20_000);
    expect(result.revenueMinor).toBe(15_000);
    expect(result.openMinor).toBe(3_000);
    expect(result.cancelledMinor).toBe(2_000);
    expect(result.returnedMinor).toBe(0);
    expect(result.averageOrderValueMinor).toBe(7_500);
  });

  it("always reconciles gross sales with recognised, open, cancelled and returned value", () => {
    for (const range of ["7d", "30d", "90d", "all"] as AnalyticsRange[]) {
      const result = computeVendorAnalytics(ALL, range, NOW);
      expect(
        result.revenueMinor +
          result.openMinor +
          result.cancelledMinor +
          result.returnedMinor,
        range,
      ).toBe(result.grossSalesMinor);
    }
  });

  it("groups revenue by delivery date and orders by placement date", () => {
    const result = computeVendorAnalytics(ALL, "7d", NOW);

    expect(result.granularity).toBe("day");
    expect(result.orderSeries).toHaveLength(7);
    expect(sumSeries(result.orderSeries)).toBe(result.totalOrders);
    expect(sumSeries(result.revenueSeries)).toBe(result.revenueMinor);

    const revenueByDay = new Map(
      result.revenueSeries.map((point) => [point.key, point.value]),
    );
    expect(revenueByDay.get("2026-11-05")).toBe(10_000);
    expect(revenueByDay.get("2026-11-06")).toBe(5_000);

    const ordersByDay = new Map(
      result.orderSeries.map((point) => [point.key, point.value]),
    );
    expect(ordersByDay.get("2026-11-01")).toBe(1);
    expect(ordersByDay.get("2026-11-02")).toBe(1);
    expect(ordersByDay.get("2026-11-04")).toBe(1);
    expect(ordersByDay.get("2026-11-06")).toBe(1);
  });

  it("includes returned lines in the gross total but not in revenue for 30 days", () => {
    const result = computeVendorAnalytics(ALL, "30d", NOW);

    expect(result.totalOrders).toBe(5);
    expect(result.grossSalesMinor).toBe(22_000);
    expect(result.revenueMinor).toBe(15_000);
    expect(result.returnedMinor).toBe(2_000);
    expect(result.returnedOrders).toBe(1);
  });

  it("uses monthly buckets and the oldest loaded shop line for all time", () => {
    const result = computeVendorAnalytics(ALL, "all", NOW);

    expect(result.granularity).toBe("month");
    expect(result.totalOrders).toBe(6);
    expect(result.grossSalesMinor).toBe(29_000);
    expect(result.revenueMinor).toBe(22_000);
    expect(result.windowStart.slice(0, 10)).toBe("2026-09-01");
    expect(result.revenueSeries.map((point) => point.key)).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(sumSeries(result.revenueSeries)).toBe(result.revenueMinor);
    expect(sumSeries(result.orderSeries)).toBe(result.totalOrders);
  });

  it("aggregates best sellers from delivered items only", () => {
    const result = computeVendorAnalytics(ALL, "all", NOW);
    const rose = result.bestSellers.find((item) => item.key === "product-a");

    expect(rose).toMatchObject({
      name: "Rose box",
      units: 3,
      revenueMinor: 11_000,
      orders: 2,
    });
    expect(
      result.bestSellers.some((item) => item.key === "product-c"),
    ).toBe(true);
    expect(
      result.bestSellers.some((item) => item.key === "product-b"),
    ).toBe(true);
  });

  it("deduplicates suborders that arrive twice through a joined read", () => {
    const result = computeVendorAnalytics(
      [...ALL, deliveredOne, deliveredOne],
      "7d",
      NOW,
    );

    expect(result.totalOrders).toBe(4);
    expect(result.grossSalesMinor).toBe(20_000);
    expect(result.revenueMinor).toBe(15_000);
    expect(result.bestSellers.find((item) => item.key === "product-a")?.units).toBe(3);
  });

  it("falls back to the placement date when delivered_at is missing", () => {
    const result = computeVendorAnalytics(
      [
        suborder({
          id: "sub-null-delivery",
          status: "delivered",
          subtotal_minor: 4_200,
          created_at: "2026-11-03T09:00:00.000Z",
          delivered_at: null,
        }),
      ],
      "7d",
      NOW,
    );

    expect(result.revenueMinor).toBe(4_200);
    expect(
      result.revenueSeries.find((point) => point.key === "2026-11-03")?.value,
    ).toBe(4_200);
  });

  it("returns a stable empty result when there are no orders", () => {
    const result = computeVendorAnalytics([], "30d", NOW);

    expect(result.totalOrders).toBe(0);
    expect(result.revenueMinor).toBe(0);
    expect(result.averageOrderValueMinor).toBe(0);
    expect(result.bestSellers).toEqual([]);
    expect(sumSeries(result.orderSeries)).toBe(0);
    expect(sumSeries(result.revenueSeries)).toBe(0);
  });
});

describe("analyticsWindowStart", () => {
  it("counts today as one of the seven days", () => {
    expect(analyticsWindowStart("7d", NOW)?.toISOString()).toBe(
      "2026-10-31T00:00:00.000Z",
    );
  });

  it("returns null for all time so the page can use the bounded history read", () => {
    expect(analyticsWindowStart("all", NOW)).toBeNull();
  });
});

describe("analyticsQueryLimit", () => {
  it("bounds only the all-time read", () => {
    expect(analyticsQueryLimit("all")).toBe(ANALYTICS_ALL_TIME_ROW_LIMIT);
    expect(ANALYTICS_ALL_TIME_ROW_LIMIT).toBeGreaterThan(0);
    expect(analyticsQueryLimit("7d")).toBeNull();
    expect(analyticsQueryLimit("30d")).toBeNull();
    expect(analyticsQueryLimit("90d")).toBeNull();
  });
});

describe("isAnalyticsRange", () => {
  it("accepts only the supported query values", () => {
    expect(isAnalyticsRange("7d")).toBe(true);
    expect(isAnalyticsRange("all")).toBe(true);
    expect(isAnalyticsRange("year")).toBe(false);
    expect(isAnalyticsRange(undefined)).toBe(false);
  });
});
