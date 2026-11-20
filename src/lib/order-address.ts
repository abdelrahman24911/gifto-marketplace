import { GOVERNORATE_NAMES, isGovernorate } from "@/lib/governorates";

/**
 * Admin delivery-address correction (P1-13, H-10).
 *
 * The database RPC (migration 40, `correct_order_address`) is the real
 * gate — it re-checks every rule below. This module holds the same rules in
 * pure form so the server action can reject bad input before touching the
 * database and so the rules are unit-testable without a database.
 */

/** Reasons an admin may correct a delivery address. */
export const ADDRESS_CORRECTION_REASONS = {
  wrong_address: "Wrong or incomplete address",
  customer_request: "Customer asked for a different address",
  other: "Other (add a note)",
} as const;

export type AddressCorrectionReasonCode =
  keyof typeof ADDRESS_CORRECTION_REASONS;

export function isAddressCorrectionReasonCode(
  value: string,
): value is AddressCorrectionReasonCode {
  return value in ADDRESS_CORRECTION_REASONS;
}

export type AddressCorrectionValues = {
  recipientName: string;
  contactPhone: string;
  addressLine: string;
  city: string;
  governorate: string;
  reasonCode: string;
  note: string;
};

/**
 * Validates one correction the way the RPC does (same length rules
 * place_order enforces, canonical governorate from P1-06, mandatory reason,
 * note required when the reason is "other"). Returns the first problem, or
 * null when the input is acceptable. Trims values; the caller stores the
 * trimmed result.
 */
export function validateAddressCorrection(
  values: AddressCorrectionValues,
): { error: string; values: AddressCorrectionValues } | null {
  const trimmed: AddressCorrectionValues = {
    recipientName: values.recipientName.trim(),
    contactPhone: values.contactPhone.trim(),
    addressLine: values.addressLine.trim(),
    city: values.city.trim(),
    governorate: values.governorate.trim(),
    reasonCode: values.reasonCode.trim(),
    note: values.note.trim(),
  };

  if (trimmed.recipientName.length < 2 || trimmed.recipientName.length > 120) {
    return {
      error: "Recipient name must be between 2 and 120 characters.",
      values: trimmed,
    };
  }
  if (trimmed.contactPhone.length < 5 || trimmed.contactPhone.length > 30) {
    return {
      error: "Phone number must be between 5 and 30 characters.",
      values: trimmed,
    };
  }
  if (trimmed.addressLine.length < 5 || trimmed.addressLine.length > 300) {
    return {
      error: "Address must be between 5 and 300 characters.",
      values: trimmed,
    };
  }
  if (trimmed.city.length < 2 || trimmed.city.length > 80) {
    return {
      error: "City must be between 2 and 80 characters.",
      values: trimmed,
    };
  }
  // P1-06 shipped the canonical governorate list: corrections pick from it,
  // never free text, so a corrected governorate always matches coverage
  // matching and checkout spelling.
  if (!isGovernorate(trimmed.governorate)) {
    return {
      error: "Choose a governorate from the list.",
      values: trimmed,
    };
  }
  if (!isAddressCorrectionReasonCode(trimmed.reasonCode)) {
    return { error: "Choose a valid reason for this correction.", values: trimmed };
  }
  if (trimmed.reasonCode === "other" && !trimmed.note) {
    return {
      error: "Add a note when the reason is other.",
      values: trimmed,
    };
  }
  if (trimmed.note.length > 1000) {
    return {
      error: "The note must be 1000 characters or fewer.",
      values: trimmed,
    };
  }

  return null;
}

/** Canonical governorate names for the correction form's picker. */
export { GOVERNORATE_NAMES };
