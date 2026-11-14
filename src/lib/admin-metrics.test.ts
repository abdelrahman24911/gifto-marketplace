import { describe, expect, it } from "vitest";

import {
  adminAnalyticsWindowStart,
  computeAdminMarketplaceMetrics,
  computeAdminShopPerformance,
  isAdminAnalyticsRange,
  parseAdminAnalyticsRange,
  sumAdminSeries,
  type AdminCommissionRecord,
  type AdminOrderRecord,
  type AdminShopLineRecord,
} from "@/lib/admin-metrics";

const NOW = new Date("2026-11-13T12:00:00.000Z");

const orders: AdminOrderRecord[] = [
  {
    id: "order-1",
    status: "delivered",
    subtotal_minor: 10_000,
    created_at: "2026-11-11T09:00:00.000Z",
  },
  {
    id: "order-2",
    status: "shipped",
    subtotal_minor: 5_000,
    created_at: "2026-11-12T10:00:00.000Z",
  },
  {
    id: "order-3",
    status: "cancelled",
    subtotal_minor: 2_000,
    created_at: "2026-11-13T08:00:00.000Z",
  },
  {
    id: "order-old",
    status: "delivered",
    subtotal_minor: 9_000,
    created_at: "2026-10-01T09:00:00.000Z",
  },
];

const commissions: AdminCommissionRecord[] = [
  {
    id: "commission-1",
    vendor_id: "shop-a",
    status: "earned",
    amount_minor: 800,
    base_minor: 10_000,
    earned_at: "2026-11-11T12:00:00.000Z",
    reversed_at: null,
  },
  {
    id: "commission-2",
    vendor_id: "shop-b",
    status: "earned",
    amount_minor: 250,
    base_minor: 5_000,
    earned_at: "2026-11-13T11:00:00.000Z",
    reversed_at: null,
  },
  {
    id: "commission-3",
    vendor_id: "shop-a",
    status: "reversed",
    amount_minor: 400,
    base_minor: 4_000,
    earned_at: "2026-11-12T13:00:00.000Z",
    reversed_at: "2026-11-13T09:00:00.000Z",
  },
  {
    id: "commission-old",
    vendor_id: "shop-a",
    status: "earned",
    amount_minor: 600,
    base_minor: 8_000,
    earned_at: "2026-09-01T12:00:00.000Z",
    reversed_at: null,
  },
];

const shopLines: AdminShopLineRecord[] = [
  {
    id: "line-1",
    vendor_id: "shop-a",
    vendor_name: "Shop A",
    status: "delivered",
    subtotal_minor: 6_000,
    created_at: "2026-11-11T09:00:00.000Z",
  },
  {
    id: "line-2",
    vendor_id: "shop-a",
    vendor_name: "Shop A",
    status: "cancelled",
    subtotal_minor: 2_000,
    created_at: "2026-11-12T09:00:00.000Z",
  },
  {
    id: "line-3",
    vendor_id: "shop-b",
    vendor_name: "Shop B",
    status: "delivered",
    subtotal_minor: 4_500,
    created_at: "2026-11-13T09:00:00.000Z",
  },
  {
    id: "line-old",
    vendor_id: "shop-b",
    vendor_name: "Shop B",
    status: "delivered",
    subtotal_minor: 9_000,
    created_at: "2026-09-01T09:00:00.000Z",
  },
];

describe("computeAdminMarketplaceMetrics", () => {
  it("computes placed GMV, exact order counts, and earned commission only", () => {
    const result = computeAdminMarketplaceMetrics(
      orders,
      commissions,
      "7d",
      NOW,
    );

    expect(result.totalOrders).toBe(3);
    expect(result.gmvMinor).toBe(17_000);
    expect(result.commissionEarnedMinor).toBe(1_050);
    expect(result.averageOrderValueMinor).toBe(5_667);
    expect(result.statusCounts).toMatchObject({
      delivered: 1,
      shipped: 1,
      cancelled: 1,
      placed: 0,
    });
    expect(result.windowStart).toBe("2026-11-07T00:00:00.000Z");
    expect(result.granularity).toBe("day");
    expect(result.orderSeries).toHaveLength(7);
    expect(sumAdminSeries(result.orderSeries)).toBe(3);
    expect(sumAdminSeries(result.gmvSeries)).toBe(17_000);
    expect(sumAdminSeries(result.commissionSeries)).toBe(1_050);
  });

  it("deduplicates joined rows and ignores malformed dates", () => {
    const result = computeAdminMarketplaceMetrics(
      [
        ...orders,
        orders[0],
        {
          id: "order-bad-date",
          status: "placed",
          subtotal_minor: 1_000,
          created_at: "not-a-date",
        },
      ],
      [...commissions, commissions[0]],
      "7d",
      NOW,
    );

    expect(result.totalOrders).toBe(3);
    expect(result.gmvMinor).toBe(17_000);
    expect(result.commissionEarnedMinor).toBe(1_050);
  });

  it("uses weekly buckets for the 90-day range", () => {
    const result = computeAdminMarketplaceMetrics(
      orders,
      commissions,
      "90d",
      NOW,
    );

    expect(result.granularity).toBe("week");
    expect(result.totalOrders).toBe(4);
    expect(result.gmvMinor).toBe(26_000);
    expect(result.commissionEarnedMinor).toBe(1_650);
    expect(result.orderSeries.length).toBeGreaterThan(10);
    expect(sumAdminSeries(result.orderSeries)).toBe(4);
    expect(sumAdminSeries(result.gmvSeries)).toBe(26_000);
    expect(sumAdminSeries(result.commissionSeries)).toBe(1_650);
  });

  it("returns stable empty series when there is no activity", () => {
    const result = computeAdminMarketplaceMetrics([], [], "30d", NOW);

    expect(result.totalOrders).toBe(0);
    expect(result.gmvMinor).toBe(0);
    expect(result.commissionEarnedMinor).toBe(0);
    expect(result.averageOrderValueMinor).toBe(0);
    expect(result.orderSeries).toHaveLength(30);
    expect(sumAdminSeries(result.orderSeries)).toBe(0);
    expect(sumAdminSeries(result.gmvSeries)).toBe(0);
    expect(sumAdminSeries(result.commissionSeries)).toBe(0);
  });
});

describe("computeAdminShopPerformance", () => {
  it("ranks shops by gross placed value while tracking delivered value", () => {
    const result = computeAdminShopPerformance(shopLines, "7d", NOW);

    expect(result).toEqual([
      {
        vendorId: "shop-a",
        name: "Shop A",
        grossMinor: 8_000,
        deliveredMinor: 6_000,
        lineCount: 2,
        deliveredLineCount: 1,
      },
      {
        vendorId: "shop-b",
        name: "Shop B",
        grossMinor: 4_500,
        deliveredMinor: 4_500,
        lineCount: 1,
        deliveredLineCount: 1,
      },
    ]);
  });

  it("deduplicates lines and excludes rows outside the window", () => {
    const result = computeAdminShopPerformance(
      [...shopLines, shopLines[0]],
      "30d",
      NOW,
    );

    expect(result.find((shop) => shop.vendorId === "shop-a")).toMatchObject({
      lineCount: 2,
      grossMinor: 8_000,
    });
    expect(result.find((shop) => shop.vendorId === "shop-b")).toMatchObject({
      lineCount: 1,
      grossMinor: 4_500,
    });
  });
});

describe("admin range helpers", () => {
  it("accepts only the supported ranges", () => {
    expect(isAdminAnalyticsRange("7d")).toBe(true);
    expect(isAdminAnalyticsRange("30d")).toBe(true);
    expect(isAdminAnalyticsRange("90d")).toBe(true);
    expect(isAdminAnalyticsRange("all")).toBe(false);
    expect(parseAdminAnalyticsRange("invalid")).toBe("30d");
    expect(parseAdminAnalyticsRange(undefined)).toBe("30d");
    expect(parseAdminAnalyticsRange("7d")).toBe("7d");
  });

  it("counts today in each window", () => {
    expect(
      adminAnalyticsWindowStart("7d", NOW).toISOString(),
    ).toBe("2026-11-07T00:00:00.000Z");
    expect(
      adminAnalyticsWindowStart("30d", NOW).toISOString(),
    ).toBe("2026-10-15T00:00:00.000Z");
    expect(
      adminAnalyticsWindowStart("90d", NOW).toISOString(),
    ).toBe("2026-08-16T00:00:00.000Z");
  });
});
