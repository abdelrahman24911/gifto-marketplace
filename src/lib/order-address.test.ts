import { describe, expect, it } from "vitest";

import {
  isAddressCorrectionReasonCode,
  validateAddressCorrection,
  type AddressCorrectionValues,
} from "./order-address";

const valid: AddressCorrectionValues = {
  recipientName: "Audit Buyer",
  contactPhone: "01001112233",
  addressLine: "14 Corrected Street",
  city: "Smouha",
  governorate: "Alexandria",
  reasonCode: "wrong_address",
  note: "",
};

describe("validateAddressCorrection (P1-13)", () => {
  it("accepts a valid correction and trims values", () => {
    const result = validateAddressCorrection({
      ...valid,
      recipientName: "  Audit Buyer  ",
    });
    expect(result).toBeNull();
  });

  it("rejects a non-canonical governorate instead of guessing one", () => {
    const result = validateAddressCorrection({
      ...valid,
      governorate: "Cairo Governorate",
    });
    expect(result?.error).toBe("Choose a governorate from the list.");
  });

  it("rejects a missing reason", () => {
    const result = validateAddressCorrection({ ...valid, reasonCode: "" });
    expect(result?.error).toBe("Choose a valid reason for this correction.");
  });

  it("requires a note when the reason is other", () => {
    const withoutNote = validateAddressCorrection({
      ...valid,
      reasonCode: "other",
      note: "   ",
    });
    expect(withoutNote?.error).toBe("Add a note when the reason is other.");

    const withNote = validateAddressCorrection({
      ...valid,
      reasonCode: "other",
      note: "Customer called to change the building number.",
    });
    expect(withNote).toBeNull();
  });

  it("rejects an over-long note and short fields", () => {
    expect(
      validateAddressCorrection({ ...valid, note: "x".repeat(1001) })?.error,
    ).toBe("The note must be 1000 characters or fewer.");
    expect(
      validateAddressCorrection({ ...valid, recipientName: "A" })?.error,
    ).toBe("Recipient name must be between 2 and 120 characters.");
    expect(validateAddressCorrection({ ...valid, city: "X" })?.error).toBe(
      "City must be between 2 and 80 characters.",
    );
  });
});

describe("isAddressCorrectionReasonCode", () => {
  it("accepts only the three correction reasons", () => {
    expect(isAddressCorrectionReasonCode("wrong_address")).toBe(true);
    expect(isAddressCorrectionReasonCode("customer_request")).toBe(true);
    expect(isAddressCorrectionReasonCode("other")).toBe(true);
    expect(isAddressCorrectionReasonCode("customer_refused")).toBe(false);
    expect(isAddressCorrectionReasonCode("")).toBe(false);
  });
});
