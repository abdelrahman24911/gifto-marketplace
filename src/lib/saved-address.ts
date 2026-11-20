/**
 * A saved address from the customer's address book (migration 47).
 *
 * The address book stores snapshots: using one at checkout copies its
 * fields into the order, and editing or deleting it afterwards never
 * rewrites a placed order.
 */

import { isGovernorate } from "@/lib/governorates";

export type SavedAddress = {
  id: string;
  label: string;
  recipientName: string;
  contactPhone: string;
  addressLine: string;
  city: string;
  governorate: string;
  /** Delivery notes saved with the address, if any. */
  notes: string | null;
};

export type SavedAddressInput = {
  label: string;
  recipientName: string;
  contactPhone: string;
  addressLine: string;
  city: string;
  governorate: string;
  notes: string;
};

/**
 * Client/server-shared mirror of the database checks on
 * `saved_addresses` (migration 47) — same length rules `place_order`
 * enforces, so an address that saves can always be used at checkout.
 * Returns a friendly error message, or null when the input is acceptable.
 * The database re-checks everything.
 */
export function validateSavedAddressInput(
  input: SavedAddressInput,
): string | null {
  if (input.label.trim().length < 2 || input.label.trim().length > 40) {
    return "Label must be 2–40 characters.";
  }
  if (
    input.recipientName.trim().length < 2 ||
    input.recipientName.trim().length > 120
  ) {
    return "Recipient name must be 2–120 characters.";
  }
  if (
    input.contactPhone.trim().length < 5 ||
    input.contactPhone.trim().length > 30
  ) {
    return "Contact phone must be 5–30 characters.";
  }
  if (
    input.addressLine.trim().length < 5 ||
    input.addressLine.trim().length > 300
  ) {
    return "Address must be 5–300 characters.";
  }
  if (input.city.trim().length < 2 || input.city.trim().length > 80) {
    return "City must be 2–80 characters.";
  }
  if (!isGovernorate(input.governorate.trim())) {
    return "Choose a governorate from the list.";
  }
  if (input.notes.trim().length > 1000) {
    return "Notes must be 1000 characters or fewer.";
  }
  return null;
}
