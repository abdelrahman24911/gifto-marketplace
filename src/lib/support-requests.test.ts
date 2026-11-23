import { describe, expect, it } from "vitest";

import {
  ADMIN_SUPPORT_REQUEST_COLUMNS,
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

describe("ADMIN_SUPPORT_REQUEST_COLUMNS", () => {
  it("disambiguates the creator embed with the created_by FK", () => {
    // support_requests has two FKs to profiles (created_by and replied_by,
    // migration 69). A bare creator:profiles(...) embed is ambiguous and
    // PostgREST rejects the admin queue list query with PGRST201.
    expect(ADMIN_SUPPORT_REQUEST_COLUMNS).toContain(
      "creator:profiles!support_requests_created_by_fkey(full_name)",
    );
    expect(ADMIN_SUPPORT_REQUEST_COLUMNS).not.toMatch(
      /creator:profiles\(/,
    );
  });

  it("still selects the queue columns the admin page renders", () => {
    for (const column of [
      "id",
      "category",
      "subject",
      "body",
      "status",
      "admin_reply",
      "replied_at",
      "created_at",
      "vendor:vendors(name, slug)",
    ]) {
      expect(ADMIN_SUPPORT_REQUEST_COLUMNS).toContain(column);
    }
  });
});
