/**
 * Vendor inventory list sorting and manual stock-adjustment validation.
 *
 * The list defaults to lowest stock first — the order that surfaces what
 * needs restocking — but the default was unlabeled and there was no way to
 * change it. The adjustment form labelled its Reason field "(optional)"
 * while the page copy says a reason is required for the audit trail; the
 * note is stored in inventory_movements.note, so the action now rejects
 * an empty reason instead of recording a blank audit entry.
 */

export type InventorySort = "low" | "high" | "name" | "newest";

export const INVENTORY_SORTS: ReadonlyArray<{
  value: InventorySort;
  label: string;
}> = [
  { value: "low", label: "Lowest stock first" },
  { value: "high", label: "Highest stock first" },
  { value: "name", label: "Name A–Z" },
  { value: "newest", label: "Newest first" },
];

export function parseInventorySort(value: string | undefined): InventorySort {
  return value === "high" || value === "name" || value === "newest"
    ? value
    : "low";
}

export function inventorySortLabel(sort: InventorySort): string {
  return INVENTORY_SORTS.find((option) => option.value === sort)?.label ?? "Lowest stock first";
}

export const STOCK_NOTE_MAX = 280;

/** Returns an error message when the audit-trail reason is unusable. */
export function validateStockNote(note: string): string | null {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    return "Add a reason for this stock change — it is recorded in the audit trail.";
  }
  if (trimmed.length > STOCK_NOTE_MAX) {
    return `A note must be ${STOCK_NOTE_MAX} characters or fewer.`;
  }
  return null;
}
