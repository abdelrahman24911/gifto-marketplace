import { describe, expect, it } from "vitest";

import {
  isSupportCategory,
  SUPPORT_CATEGORIES,
  SUPPORT_REPLY_MAX,
  supportCategoryLabel,
  validateAdminReply,
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

describe("validateAdminReply", () => {
  it("accepts an empty reply (no change to the stored reply)", () => {
    expect(validateAdminReply("")).toBeNull();
    expect(validateAdminReply("   ")).toBeNull();
  });

  it("rejects a reply over the limit", () => {
    expect(validateAdminReply("x".repeat(SUPPORT_REPLY_MAX + 1))).toMatch(
      /4000 characters or fewer/,
    );
  });

  it("accepts a reply at the limit", () => {
    expect(validateAdminReply("x".repeat(SUPPORT_REPLY_MAX))).toBeNull();
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
