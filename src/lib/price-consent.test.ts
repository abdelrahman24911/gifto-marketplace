import { describe, expect, it } from "vitest";

import {
  buildPriceDiff,
  hasPriceChange,
  parseExpectedPrices,
} from "./price-consent";

const PRODUCT_A = "51100000-0000-0000-0000-000000000101";
const PRODUCT_B = "51100000-0000-0000-0000-000000000102";

describe("parseExpectedPrices", () => {
  it("accepts a well-formed payload", () => {
    expect(
      parseExpectedPrices([
        { product_id: PRODUCT_A, unit_price_minor: 30000 },
        { product_id: PRODUCT_B, unit_price_minor: 12000 },
      ]),
    ).toEqual([
      { product_id: PRODUCT_A, unit_price_minor: 30000 },
      { product_id: PRODUCT_B, unit_price_minor: 12000 },
    ]);
  });

  it("rejects malformed payloads", () => {
    expect(parseExpectedPrices(null)).toBeNull();
    expect(parseExpectedPrices("not-an-array")).toBeNull();
    expect(parseExpectedPrices([])).toBeNull();
    expect(parseExpectedPrices([{ product_id: "nope", unit_price_minor: 1 }])).toBeNull();
    expect(
      parseExpectedPrices([{ product_id: PRODUCT_A, unit_price_minor: -5 }]),
    ).toBeNull();
    expect(
      parseExpectedPrices([{ product_id: PRODUCT_A, unit_price_minor: 10.5 }]),
    ).toBeNull();
    expect(
      parseExpectedPrices([{ product_id: PRODUCT_A }]),
    ).toBeNull();
  });

  it("rejects duplicate product lines", () => {
    expect(
      parseExpectedPrices([
        { product_id: PRODUCT_A, unit_price_minor: 100 },
        { product_id: PRODUCT_A, unit_price_minor: 200 },
      ]),
    ).toBeNull();
  });
});

describe("buildPriceDiff", () => {
  it("builds the old-vs-new diff with totals", () => {
    const diff = buildPriceDiff(
      [
        { product_id: PRODUCT_A, unit_price_minor: 30000 },
        { product_id: PRODUCT_B, unit_price_minor: 12000 },
      ],
      new Map([
        [PRODUCT_A, 2],
        [PRODUCT_B, 1],
      ]),
      [
        { id: PRODUCT_A, name: "G One", price_minor: 35000 },
        { id: PRODUCT_B, name: "G Two", price_minor: 12000 },
      ],
    );
    expect(diff).toEqual({
      lines: [
        {
          productId: PRODUCT_A,
          name: "G One",
          quantity: 2,
          expectedMinor: 30000,
          liveMinor: 35000,
        },
        {
          productId: PRODUCT_B,
          name: "G Two",
          quantity: 1,
          expectedMinor: 12000,
          liveMinor: 12000,
        },
      ],
      expectedTotalMinor: 72000,
      liveTotalMinor: 82000,
    });
    expect(diff && hasPriceChange(diff)).toBe(true);
  });

  it("reports no change when prices match", () => {
    const diff = buildPriceDiff(
      [{ product_id: PRODUCT_A, unit_price_minor: 30000 }],
      new Map([[PRODUCT_A, 1]]),
      [{ id: PRODUCT_A, name: "G One", price_minor: 30000 }],
    );
    expect(diff && hasPriceChange(diff)).toBe(false);
  });

  it("returns null when live data is incomplete", () => {
    expect(
      buildPriceDiff(
        [{ product_id: PRODUCT_A, unit_price_minor: 30000 }],
        new Map([[PRODUCT_A, 1]]),
        [],
      ),
    ).toBeNull();
  });
});
