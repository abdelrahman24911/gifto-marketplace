import { describe, expect, it } from "vitest";

import {
  isSupportCategory,
  SUPPORT_CATEGORIES,
  supportCategoryLabel,
} from "./support-requests";

describe("supportCategoryLabel", () => {
  it("labels every known category", () => {
    for (const category of SUPPORT_CATEGORIES) {
      expect(supportCategoryLabel(category.value)).toBe(category.label);
    }
  });

  it("falls back to the raw value for an unknown category", () => {
    expect(supportCategoryLabel("mystery")).toBe("mystery");
  });
});

describe("isSupportCategory", () => {
  it("accepts known categories and rejects the rest", () => {
    expect(isSupportCategory("orders")).toBe(true);
    expect(isSupportCategory("finance")).toBe(true);
    expect(isSupportCategory("bogus")).toBe(false);
    expect(isSupportCategory("")).toBe(false);
  });
});
