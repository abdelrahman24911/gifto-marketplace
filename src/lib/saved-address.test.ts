import { describe, expect, it } from "vitest";

import {
  validateSavedAddressInput,
  type SavedAddressInput,
} from "@/lib/saved-address";

const valid: SavedAddressInput = {
  label: "Home",
  recipientName: "Sara Buyer",
  contactPhone: "01001112233",
  addressLine: "12 Main Street",
  city: "Alexandria",
  governorate: "Alexandria",
  notes: "",
};

describe("validateSavedAddressInput", () => {
  it("accepts a valid address", () => {
    expect(validateSavedAddressInput(valid)).toBeNull();
  });

  it("rejects short labels, names, phones, addresses and cities", () => {
    expect(validateSavedAddressInput({ ...valid, label: "H" })).toMatch(
      /Label/,
    );
    expect(validateSavedAddressInput({ ...valid, label: "x".repeat(41) })).toMatch(
      /Label/,
    );
    expect(validateSavedAddressInput({ ...valid, recipientName: "S" })).toMatch(
      /Recipient/,
    );
    expect(validateSavedAddressInput({ ...valid, contactPhone: "010" })).toMatch(
      /phone/,
    );
    expect(validateSavedAddressInput({ ...valid, addressLine: "12" })).toMatch(
      /Address/,
    );
    expect(validateSavedAddressInput({ ...valid, city: "A" })).toMatch(/City/);
  });

  it("rejects a non-canonical governorate and over-long notes", () => {
    expect(
      validateSavedAddressInput({ ...valid, governorate: "Alex" }),
    ).toMatch(/governorate/);
    expect(
      validateSavedAddressInput({ ...valid, governorate: "Cairo" }),
    ).toBeNull();
    expect(
      validateSavedAddressInput({ ...valid, notes: "x".repeat(1001) }),
    ).toMatch(/Notes/);
  });
});
