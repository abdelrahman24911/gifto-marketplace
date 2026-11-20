/**
 * A saved address from the customer's address book (migration 47).
 *
 * The address book stores snapshots: using one at checkout copies its
 * fields into the order, and editing or deleting it afterwards never
 * rewrites a placed order.
 */

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
