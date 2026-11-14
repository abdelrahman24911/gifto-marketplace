import { describe, expect, it } from "vitest";

import {
  BUSINESS_TIME_ZONE,
  businessDateKey,
  businessDayWindow,
  startOfBusinessDay,
  startOfBusinessDayOffset,
  startOfBusinessMonth,
} from "@/lib/business-time";

describe("business time", () => {
  it("uses Cairo as the shop business timezone", () => {
    expect(BUSINESS_TIME_ZONE).toBe("Africa/Cairo");
  });

  it("starts the business day at Cairo midnight in winter", () => {
    const now = new Date("2026-11-06T12:00:00.000Z");

    expect(startOfBusinessDay(now).toISOString()).toBe(
      "2026-11-05T22:00:00.000Z",
    );
    expect(businessDateKey(now)).toBe("2026-11-06");
  });

  it("starts the business day at Cairo midnight in summer", () => {
    const now = new Date("2026-07-15T12:00:00.000Z");

    expect(startOfBusinessDay(now).toISOString()).toBe(
      "2026-07-14T21:00:00.000Z",
    );
  });

  it("rolls the business date over at Cairo midnight, not UTC midnight", () => {
    const lateUtc = new Date("2026-11-06T23:30:00.000Z");

    expect(businessDateKey(lateUtc)).toBe("2026-11-07");
    expect(startOfBusinessDay(lateUtc).toISOString()).toBe(
      "2026-11-06T22:00:00.000Z",
    );
  });

  it("returns an exclusive next-day boundary", () => {
    const window = businessDayWindow(new Date("2026-11-06T12:00:00.000Z"));

    expect(window.dateKey).toBe("2026-11-06");
    expect(window.start.toISOString()).toBe("2026-11-05T22:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-06T22:00:00.000Z");
  });

  it("counts calendar days back across month boundaries", () => {
    const now = new Date("2026-11-06T12:00:00.000Z");

    expect(startOfBusinessDayOffset(now, 6).toISOString()).toBe(
      "2026-10-30T22:00:00.000Z",
    );
  });

  it("starts the business month at Cairo midnight on day one", () => {
    expect(
      startOfBusinessMonth(new Date("2026-11-06T12:00:00.000Z")).toISOString(),
    ).toBe("2026-10-31T22:00:00.000Z");
  });
});
