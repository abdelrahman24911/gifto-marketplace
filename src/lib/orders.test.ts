import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS_HELP,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  VENDOR_NEXT_STATUSES,
  isOrderStatus,
  isTerminalOrderStatus,
} from "./orders";

describe("order status metadata", () => {
  it("has a label, style and help entry for every status", () => {
    for (const status of Object.keys(ORDER_STATUS_LABELS)) {
      expect(ORDER_STATUS_STYLES).toHaveProperty(status);
      expect(ORDER_STATUS_HELP).toHaveProperty(status);
    }
  });

  it("recognises the parent-only partially_completed state", () => {
    expect(isOrderStatus("partially_completed")).toBe(true);
    expect(ORDER_STATUS_LABELS.partially_completed).toBe("Partially completed");
    expect(isTerminalOrderStatus("partially_completed")).toBe(true);
  });

  it("treats delivered, cancelled and returned as terminal", () => {
    expect(isTerminalOrderStatus("delivered")).toBe(true);
    expect(isTerminalOrderStatus("cancelled")).toBe(true);
    expect(isTerminalOrderStatus("returned")).toBe(true);
  });

  it("does not treat active fulfilment states as terminal", () => {
    expect(isTerminalOrderStatus("placed")).toBe(false);
    expect(isTerminalOrderStatus("confirmed")).toBe(false);
    expect(isTerminalOrderStatus("shipped")).toBe(false);
  });
});

describe("vendor next statuses", () => {
  it("allows a shipped COD delivery to fail and restock", () => {
    const options = VENDOR_NEXT_STATUSES.shipped ?? [];
    const failed = options.find((option) => option.value === "cancelled");

    expect(failed?.label).toBe("Delivery failed - cancel and restock");
    expect(failed?.confirm).toMatch(/return its items to stock/i);
    expect(options.map((option) => option.value)).toContain("delivered");
  });

  it("does not offer a next step after a terminal suborder", () => {
    expect(VENDOR_NEXT_STATUSES.delivered).toBeUndefined();
    expect(VENDOR_NEXT_STATUSES.cancelled).toBeUndefined();
    expect(VENDOR_NEXT_STATUSES.returned).toBeUndefined();
  });
});
