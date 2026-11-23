import { describe, expect, it } from "vitest";

import {
  PRODUCT_SORTS,
  parseProductSort,
  productSortLabel,
} from "./product-sort";

describe("parseProductSort", () => {
  it("defaults to newest first", () => {
    expect(parseProductSort(undefined)).toBe("newest");
    expect(parseProductSort("bogus")).toBe("newest");
  });

  it("parses each supported sort", () => {
    for (const option of PRODUCT_SORTS) {
      expect(parseProductSort(option.value)).toBe(option.value);
    }
  });
});

describe("productSortLabel", () => {
  it("labels every sort", () => {
    expect(productSortLabel("newest")).toBe("Newest first");
    expect(productSortLabel("name")).toBe("Name A–Z");
    expect(productSortLabel("price-asc")).toBe("Price: low to high");
    expect(productSortLabel("price-desc")).toBe("Price: high to low");
    expect(productSortLabel("stock")).toBe("Lowest stock first");
  });
});
