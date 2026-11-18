import { describe, expect, it } from "vitest";

import { toQuickAddItem } from "@/lib/quick-add";

const PRODUCT = {
  id: "product-1",
  name: "Test gift",
  slug: "test-gift",
  priceMinor: 42_000,
  stock: 3,
  imagePath: "vendor/product/image.png",
  vendorId: "vendor-1",
  vendorName: "Test shop",
  vendorSlug: "test-shop",
};

describe("toQuickAddItem", () => {
  it("maps the display fields without inventing a quantity", () => {
    const item = toQuickAddItem(PRODUCT);

    expect(item).toMatchObject({
      productId: "product-1",
      vendorId: "vendor-1",
      vendorName: "Test shop",
      vendorSlug: "test-shop",
      name: "Test gift",
      slug: "test-gift",
      priceMinor: 42_000,
      imagePath: "vendor/product/image.png",
      stock: 3,
    });
    expect(item).not.toHaveProperty("quantity");
  });

  it("omits products whose public vendor name is unavailable", () => {
    expect(toQuickAddItem({ ...PRODUCT, vendorName: null })).toBeNull();
  });
});
