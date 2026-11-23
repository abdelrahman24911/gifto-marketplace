import { describe, expect, it } from "vitest";

import {
  INVENTORY_SORTS,
  inventorySortLabel,
  parseInventorySort,
  STOCK_NOTE_MAX,
  validateStockNote,
} from "./inventory";

describe("parseInventorySort", () => {
  it("defaults to lowest stock first", () => {
    expect(parseInventorySort(undefined)).toBe("low");
    expect(parseInventorySort("bogus")).toBe("low");
  });

  it("parses each supported sort", () => {
    for (const option of INVENTORY_SORTS) {
      expect(parseInventorySort(option.value)).toBe(option.value);
    }
  });
});

describe("inventorySortLabel", () => {
  it("labels every sort", () => {
    expect(inventorySortLabel("low")).toBe("Lowest stock first");
    expect(inventorySortLabel("high")).toBe("Highest stock first");
    expect(inventorySortLabel("name")).toBe("Name A–Z");
    expect(inventorySortLabel("newest")).toBe("Newest first");
  });
});

describe("validateStockNote", () => {
  it("rejects an empty or whitespace-only reason", () => {
    expect(validateStockNote("")).toMatch(/reason/i);
    expect(validateStockNote("   ")).toMatch(/reason/i);
  });

  it("rejects a reason over the limit", () => {
    expect(validateStockNote("x".repeat(STOCK_NOTE_MAX + 1))).toMatch(
      /280 characters or fewer/,
    );
  });

  it("accepts a reason at the limit", () => {
    expect(validateStockNote("x".repeat(STOCK_NOTE_MAX))).toBeNull();
  });

  it("accepts an ordinary reason", () => {
    expect(validateStockNote("Restock from supplier")).toBeNull();
  });
});
