import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GIFT_MESSAGE_MAX_LENGTH,
  GIFT_OPTIONS_STORAGE_KEY,
  isValidPreferredDeliveryDate,
  preferredDeliveryDateRange,
  readGiftOptions,
  toISODateLocal,
  validateGiftOptions,
  writeGiftOptions,
} from "@/lib/gift-options";

// 2026-11-20 is a Friday; the window is 2026-11-21 .. 2026-12-04.
const TODAY = new Date(2026, 10, 20);

describe("preferred delivery date window", () => {
  it("spans tomorrow through 14 days out", () => {
    expect(preferredDeliveryDateRange(TODAY)).toEqual({
      min: "2026-11-21",
      max: "2026-12-04",
    });
  });

  it("accepts both window edges and rejects today and day 15", () => {
    expect(isValidPreferredDeliveryDate("2026-11-21", TODAY)).toBe(true);
    expect(isValidPreferredDeliveryDate("2026-12-04", TODAY)).toBe(true);
    expect(isValidPreferredDeliveryDate("2026-11-20", TODAY)).toBe(false);
    expect(isValidPreferredDeliveryDate("2026-12-05", TODAY)).toBe(false);
  });

  it("accepts an empty (unset) preference", () => {
    expect(isValidPreferredDeliveryDate("", TODAY)).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    for (const bad of [
      "2026-11-5",
      "21/11/2026",
      "2026-02-30",
      "2026-13-01",
      "tomorrow",
      "2026-11-21T00:00:00",
    ]) {
      expect(isValidPreferredDeliveryDate(bad, TODAY)).toBe(false);
    }
  });

  it("formats local dates without a UTC shift", () => {
    expect(toISODateLocal(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("validateGiftOptions", () => {
  const base = {
    giftWrap: false,
    giftMessage: "",
    preferredDeliveryDate: "",
    deliveryTimeNote: "",
  };

  it("accepts an empty gift choice", () => {
    expect(validateGiftOptions(base, TODAY)).toBeNull();
  });

  it("rejects an over-long gift message and time note", () => {
    expect(
      validateGiftOptions(
        { ...base, giftMessage: "x".repeat(GIFT_MESSAGE_MAX_LENGTH + 1) },
        TODAY,
      ),
    ).toMatch(/500/);
    expect(
      validateGiftOptions({ ...base, deliveryTimeNote: "x".repeat(201) }, TODAY),
    ).toMatch(/200/);
  });

  it("rejects an out-of-window date", () => {
    expect(
      validateGiftOptions(
        { ...base, preferredDeliveryDate: "2026-11-20" },
        TODAY,
      ),
    ).toMatch(/tomorrow and 14 days/);
  });
});

describe("gift options localStorage draft", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function withStorage(raw: string | null): string[] {
    const written: string[] = [];
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) =>
          key === GIFT_OPTIONS_STORAGE_KEY ? raw : null,
        setItem: (_key: string, value: string) => {
          written.push(value);
        },
      },
    });
    return written;
  }

  it("round-trips a gift draft and rejects malformed stored values", () => {
    const written = withStorage(
      JSON.stringify({ giftWrap: true, giftMessage: "Happy birthday!" }),
    );
    expect(readGiftOptions()).toEqual({
      giftWrap: true,
      giftMessage: "Happy birthday!",
    });
    writeGiftOptions({ giftWrap: false, giftMessage: "Hi" });
    expect(JSON.parse(written[0])).toEqual({
      giftWrap: false,
      giftMessage: "Hi",
    });

    withStorage("{not json");
    expect(readGiftOptions()).toEqual({ giftWrap: false, giftMessage: "" });
    withStorage(JSON.stringify({ giftWrap: true, giftMessage: "x".repeat(501) }));
    expect(readGiftOptions()).toEqual({ giftWrap: false, giftMessage: "" });
  });
});
