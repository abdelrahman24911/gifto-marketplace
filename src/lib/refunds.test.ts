import { describe, expect, it, vi } from "vitest";

import {
  REFUND_WINDOW_DAYS,
  canRequestRefund,
  canRequestRefundWithinWindow,
  refundWindowEndsAt,
} from "./refunds";

describe("canRequestRefund", () => {
  it("allows shipped, delivered and returned suborders", () => {
    expect(canRequestRefund("shipped")).toBe(true);
    expect(canRequestRefund("delivered")).toBe(true);
    expect(canRequestRefund("returned")).toBe(true);
  });

  it("refuses placed, confirmed and cancelled suborders", () => {
    expect(canRequestRefund("placed")).toBe(false);
    expect(canRequestRefund("confirmed")).toBe(false);
    expect(canRequestRefund("cancelled")).toBe(false);
  });
});

describe("D-09 return window (P1-04)", () => {
  it("is 7 days from delivery", () => {
    expect(REFUND_WINDOW_DAYS).toBe(7);
    expect(refundWindowEndsAt("2026-11-10T10:00:00.000Z").toISOString()).toBe(
      "2026-11-17T10:00:00.000Z",
    );
  });

  it("allows a shipped suborder with no delivery date (window not started)", () => {
    expect(canRequestRefundWithinWindow("shipped", null)).toBe(true);
    expect(canRequestRefundWithinWindow("shipped", undefined)).toBe(true);
  });

  it("allows a delivered suborder inside the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T10:00:00.000Z"));
    try {
      expect(
        canRequestRefundWithinWindow("delivered", "2026-11-10T10:00:00.000Z"),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a delivered suborder past the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T10:00:00.000Z"));
    try {
      expect(
        canRequestRefundWithinWindow("delivered", "2026-11-10T10:00:00.000Z"),
      ).toBe(false);
      expect(
        canRequestRefundWithinWindow("returned", "2026-11-10T10:00:00.000Z"),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still refuses non-refundable statuses even inside the window", () => {
    expect(
      canRequestRefundWithinWindow("placed", "2026-11-10T10:00:00.000Z"),
    ).toBe(false);
    expect(
      canRequestRefundWithinWindow("cancelled", "2026-11-10T10:00:00.000Z"),
    ).toBe(false);
  });
});
