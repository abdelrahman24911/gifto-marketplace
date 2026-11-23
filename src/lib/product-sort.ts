/**
 * Product list sorting, shared by the vendor products page and the admin
 * products page. The vendor list was always newest-first with no way to
 * change it and no label saying so.
 */

export type ProductSort = "newest" | "name" | "price-asc" | "price-desc" | "stock";

export const PRODUCT_SORTS: ReadonlyArray<{
  value: ProductSort;
  label: string;
}> = [
  { value: "newest", label: "Newest first" },
  { value: "name", label: "Name A–Z" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "stock", label: "Lowest stock first" },
];

export function parseProductSort(value: string | undefined): ProductSort {
  return value === "name" ||
    value === "price-asc" ||
    value === "price-desc" ||
    value === "stock"
    ? value
    : "newest";
}

export function productSortLabel(sort: ProductSort): string {
  return PRODUCT_SORTS.find((option) => option.value === sort)?.label ?? "Newest first";
}
