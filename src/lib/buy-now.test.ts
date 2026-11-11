import { describe, expect, it } from "vitest";

import {
  BUY_NOW_PRODUCT_PARAM,
  BUY_NOW_QUANTITY_PARAM,
  buildBuyNowHref,
  checkBuyNowAvailability,
  clampPurchaseQuantity,
  maxPurchasableQuantity,
  parseBuyNowProductId,
  parseBuyNowProductRequest,
  parseBuyNowQuantity,
  selectCheckoutItems,
  shouldClearCartAfterOrder,
} from "./buy-now";
import { MAX_LINE_QUANTITY, type CartItem } from "./cart";

const PRODUCT_ID = "3f4c9d6a-0b7e-4f2a-9c1d-8e5b7a6c4d21";
const OTHER_PRODUCT_ID = "a1b2c3d4-e5f6-4789-8abc-def012345678";

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: PRODUCT_ID,
    vendorId: "v1",
    vendorName: "Shop",
    vendorSlug: "shop",
    name: "Gift",
    slug: "gift",
    priceMinor: 15000,
    imagePath: null,
    quantity: 2,
    stock: 10,
    ...overrides,
  };
}

describe("parseBuyNowProductId", () => {
  it("accepts a UUID and normalizes case", () => {
    expect(parseBuyNowProductId(PRODUCT_ID.toUpperCase())).toBe(PRODUCT_ID);
  });

  it("rejects missing, blank, and malformed ids", () => {
    expect(parseBuyNowProductId(undefined)).toBeNull();
    expect(parseBuyNowProductId(null)).toBeNull();
    expect(parseBuyNowProductId("")).toBeNull();
    expect(parseBuyNowProductId("not-a-uuid")).toBeNull();
    expect(parseBuyNowProductId(`${PRODUCT_ID}-extra`)).toBeNull();
  });
});

describe("parseBuyNowQuantity", () => {
  it("defaults a missing quantity to one", () => {
    expect(parseBuyNowQuantity(undefined)).toBe(1);
    expect(parseBuyNowQuantity(null)).toBe(1);
    expect(parseBuyNowQuantity("")).toBe(1);
    expect(parseBuyNowQuantity("   ")).toBe(1);
  });

  it("accepts whole quantities inside the line limit", () => {
    expect(parseBuyNowQuantity("1")).toBe(1);
    expect(parseBuyNowQuantity("7")).toBe(7);
    expect(parseBuyNowQuantity(String(MAX_LINE_QUANTITY))).toBe(
      MAX_LINE_QUANTITY,
    );
  });

  it("rejects zero, negatives, decimals, and over-limit values", () => {
    expect(parseBuyNowQuantity("0")).toBeNull();
    expect(parseBuyNowQuantity("-1")).toBeNull();
    expect(parseBuyNowQuantity("1.5")).toBeNull();
    expect(parseBuyNowQuantity("abc")).toBeNull();
    expect(parseBuyNowQuantity(String(MAX_LINE_QUANTITY + 1))).toBeNull();
  });
});

describe("parseBuyNowProductRequest", () => {
  it("combines a valid product id and quantity", () => {
    expect(parseBuyNowProductRequest(PRODUCT_ID, "3")).toEqual({
      productId: PRODUCT_ID,
      quantity: 3,
    });
  });

  it("returns null when either part is invalid", () => {
    expect(parseBuyNowProductRequest("bad", "3")).toBeNull();
    expect(parseBuyNowProductRequest(PRODUCT_ID, "0")).toBeNull();
  });
});

describe("checkBuyNowAvailability", () => {
  it("allows a valid quantity for an available product", () => {
    expect(checkBuyNowAvailability(2, 5, true)).toEqual({ ok: true });
    expect(checkBuyNowAvailability(5, 5, true)).toEqual({ ok: true });
  });

  it("blocks a paused shop before checking stock", () => {
    expect(checkBuyNowAvailability(1, 10, false)).toEqual({
      ok: false,
      reason: "paused",
      available: 10,
    });
  });

  it("blocks sold-out products", () => {
    expect(checkBuyNowAvailability(1, 0, true)).toEqual({
      ok: false,
      reason: "sold-out",
      available: 0,
    });
  });

  it("reports the remaining stock when the quantity is too high", () => {
    expect(checkBuyNowAvailability(6, 4, true)).toEqual({
      ok: false,
      reason: "insufficient-stock",
      available: 4,
    });
  });
});

describe("quantity bounds", () => {
  it("caps the maximum at the database line limit", () => {
    expect(maxPurchasableQuantity(0)).toBe(0);
    expect(maxPurchasableQuantity(-4)).toBe(0);
    expect(maxPurchasableQuantity(3)).toBe(3);
    expect(maxPurchasableQuantity(100)).toBe(MAX_LINE_QUANTITY);
    expect(maxPurchasableQuantity(Number.NaN)).toBe(0);
  });

  it("clamps keyboard-entered quantities to valid values", () => {
    expect(clampPurchaseQuantity(0, 5)).toBe(1);
    expect(clampPurchaseQuantity(-2, 5)).toBe(1);
    expect(clampPurchaseQuantity(6, 5)).toBe(5);
    expect(clampPurchaseQuantity(2.9, 5)).toBe(2);
    expect(clampPurchaseQuantity(Number.NaN, 5)).toBe(1);
    expect(clampPurchaseQuantity(4, 0)).toBe(1);
    expect(clampPurchaseQuantity(99, 100)).toBe(MAX_LINE_QUANTITY);
  });
});

describe("buildBuyNowHref", () => {
  it("builds a checkout URL with the selected product and quantity", () => {
    const href = buildBuyNowHref(PRODUCT_ID, 3);
    const url = new URL(href, "https://gifto.test");

    expect(url.pathname).toBe("/checkout");
    expect(url.searchParams.get(BUY_NOW_PRODUCT_PARAM)).toBe(PRODUCT_ID);
    expect(url.searchParams.get(BUY_NOW_QUANTITY_PARAM)).toBe("3");
  });

  it("clamps the quantity inside the safe range", () => {
    const tooHigh = new URL(
      buildBuyNowHref(PRODUCT_ID, 999),
      "https://gifto.test",
    );
    const tooLow = new URL(
      buildBuyNowHref(PRODUCT_ID, 0),
      "https://gifto.test",
    );

    expect(tooHigh.searchParams.get(BUY_NOW_QUANTITY_PARAM)).toBe(
      String(MAX_LINE_QUANTITY),
    );
    expect(tooLow.searchParams.get(BUY_NOW_QUANTITY_PARAM)).toBe("1");
  });
});

describe("selectCheckoutItems", () => {
  it("returns only the buy-now item even when the cart has other lines", () => {
    const cart = [
      item({ productId: OTHER_PRODUCT_ID }),
      item({ productId: "p3" }),
    ];
    const buyNow = item();

    expect(selectCheckoutItems(cart, buyNow)).toEqual([buyNow]);
  });

  it("preserves the cart array by reference when no buy-now item is set", () => {
    const cart = [item()];
    expect(selectCheckoutItems(cart, null)).toBe(cart);
  });

  it("does not mutate the cart when buy-now is used", () => {
    const cart = [item({ productId: OTHER_PRODUCT_ID })];
    const snapshot = [...cart];

    selectCheckoutItems(cart, item());

    expect(cart).toEqual(snapshot);
  });
});

describe("shouldClearCartAfterOrder", () => {
  it("clears only normal cart checkout", () => {
    expect(shouldClearCartAfterOrder(false)).toBe(true);
    expect(shouldClearCartAfterOrder(true)).toBe(false);
  });
});
