import { describe, expect, it } from "vitest";

import type { CatalogProduct } from "@/lib/catalog";
import {
  resolveReorderItems,
  type ReorderLine,
} from "@/lib/reorder";

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "prod-1",
    name: "Rose Bouquet",
    slug: "rose-bouquet",
    priceMinor: 45000,
    stock: 5,
    imagePath: "/rose.jpg",
    imageAlt: "Rose bouquet",
    vendorId: "vendor-1",
    vendorName: "Bloom Shop",
    vendorSlug: "bloom-shop",
    vendorIsAcceptingOrders: true,
    categoryName: "Flowers",
    categorySlug: "flowers",
    ...overrides,
  };
}

const line: ReorderLine = {
  productId: "prod-1",
  productName: "Rose Bouquet",
  quantity: 2,
};

describe("resolveReorderItems", () => {
  it("re-adds an available line at the live price", () => {
    const live = product({ priceMinor: 50000 });
    const result = resolveReorderItems([line], [live]);
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          productId: "prod-1",
          quantity: 2,
          priceMinor: 50000,
        }),
      ],
      skipped: [],
      adjusted: false,
    });
  });

  it("skips a product that is no longer listed", () => {
    const result = resolveReorderItems([line], []);
    expect(result.items).toEqual([]);
    expect(result.skipped).toEqual(["Rose Bouquet"]);
  });

  it("skips out-of-stock products and shops not accepting orders", () => {
    expect(
      resolveReorderItems([line], [product({ stock: 0 })]).skipped,
    ).toEqual(["Rose Bouquet"]);
    expect(
      resolveReorderItems([line], [product({ vendorIsAcceptingOrders: false })])
        .skipped,
    ).toEqual(["Rose Bouquet"]);
  });

  it("clamps the quantity to live stock and flags the adjustment", () => {
    const result = resolveReorderItems(
      [{ ...line, quantity: 4 }],
      [product({ stock: 3 })],
    );
    expect(result.items[0]?.quantity).toBe(3);
    expect(result.adjusted).toBe(true);
    expect(result.skipped).toEqual([]);
  });

  it("skips a line whose product was removed (null product id)", () => {
    const result = resolveReorderItems(
      [{ ...line, productId: null }],
      [product()],
    );
    expect(result.items).toEqual([]);
    expect(result.skipped).toEqual(["Rose Bouquet"]);
  });

  it("merges duplicate lines for the same product", () => {
    const result = resolveReorderItems(
      [line, { ...line, quantity: 1 }],
      [product({ stock: 10 })],
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.quantity).toBe(3);
  });
});
