import { describe, expect, it } from "vitest";

import { maskEmail, maskName, maskPhone } from "./mask-contact";
import {
  canViewVendorCustomerPii,
  vendorContactEmail,
  vendorContactName,
  vendorContactPhone,
} from "./vendor-pii";

describe("canViewVendorCustomerPii", () => {
  it("allows owners, managers, and platform admins", () => {
    expect(canViewVendorCustomerPii("owner")).toBe(true);
    expect(canViewVendorCustomerPii("manager")).toBe(true);
    expect(canViewVendorCustomerPii("staff", true)).toBe(true);
  });

  it("denies staff", () => {
    expect(canViewVendorCustomerPii("staff")).toBe(false);
  });
});

describe("vendor contact masking", () => {
  it("shows full contact to owners and managers", () => {
    expect(vendorContactName("Abdelrahman Osama", true)).toBe(
      "Abdelrahman Osama",
    );
    expect(vendorContactPhone("01012345678", true)).toBe("01012345678");
    expect(vendorContactEmail("abdelrahman@example.com", true)).toBe(
      "abdelrahman@example.com",
    );
  });

  it("masks contact for staff", () => {
    expect(vendorContactName("Abdelrahman Osama", false)).toBe(
      maskName("Abdelrahman Osama"),
    );

    const phone = vendorContactPhone("01012345678", false);
    expect(phone).toBe(maskPhone("01012345678"));
    expect(phone).not.toBe("01012345678");
    expect(phone?.endsWith("78")).toBe(true);

    expect(vendorContactEmail("abdelrahman@example.com", false)).toBe(
      maskEmail("abdelrahman@example.com"),
    );
  });

  it("handles missing values without exposing contact detail", () => {
    expect(vendorContactName(null, false)).toBe("Customer");
    expect(vendorContactPhone(null, false)).toBeNull();
    expect(vendorContactEmail(null, false)).toBeNull();
  });
});
