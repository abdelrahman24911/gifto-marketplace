import { isUuid } from "@/lib/occasions";
import { parsePage } from "@/lib/pagination";

import type {
  ProductStatus,
  VendorStatus,
} from "@/lib/supabase/database.types";

export const PRODUCT_PICKER_PAGE_SIZE = 10;
export const PRODUCT_PICKER_MAX_SELECTION = 500;
export const PRODUCT_PICKER_SEARCH_MAX = 80;

export const PRODUCT_PICKER_STATUSES = [
  "draft",
  "active",
  "archived",
] as const satisfies readonly ProductStatus[];

export const PRODUCT_PICKER_STATUS_FILTERS = [
  "all",
  "active",
  "draft",
  "archived",
] as const;

export type ProductPickerStatusFilter =
  (typeof PRODUCT_PICKER_STATUS_FILTERS)[number];

export const PRODUCT_PICKER_STATUS_LABELS: Record<
  ProductPickerStatusFilter,
  string
> = {
  all: "All statuses",
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

export const PRODUCT_PICKER_SORTS = [
  "newest",
  "oldest",
  "name",
  "price-asc",
  "price-desc",
] as const;

export type ProductPickerSort = (typeof PRODUCT_PICKER_SORTS)[number];

export const PRODUCT_PICKER_SORT_LABELS: Record<ProductPickerSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name A-Z",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

export type ProductPickerQuery = {
  productQuery: string;
  vendorQuery: string;
  categoryId: string | null;
  status: ProductPickerStatusFilter;
  sort: ProductPickerSort;
  page: number;
};

export type ProductPickerQueryInput = {
  productQuery?: unknown;
  vendorQuery?: unknown;
  categoryId?: unknown;
  status?: unknown;
  sort?: unknown;
  page?: unknown;
};

export type ProductPickerItem = {
  id: string;
  name: string;
  slug: string;
  priceMinor: number;
  stock: number;
  status: ProductStatus;
  createdAt: string;
  vendorName: string;
  vendorSlug: string;
  vendorStatus: VendorStatus;
  vendorAcceptingOrders: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  imagePath: string | null;
  imageAlt: string | null;
};

export type ProductPickerCategoryOption = {
  id: string;
  name: string;
  slug: string;
};

type Embedded<T> = T | T[] | null;

export type ProductPickerRow = {
  id: string;
  name: string;
  slug: string;
  price_minor: number;
  stock: number;
  status: ProductStatus;
  created_at: string;
  vendor_id: string;
  vendor: Embedded<{
    name: string;
    slug: string;
    status: VendorStatus;
    is_accepting_orders: boolean;
  }>;
  category: Embedded<{
    id: string;
    name: string;
    slug: string;
  }>;
  product_images: Array<{ path: string; alt: string | null; position: number }> | null;
};

export const PRODUCT_PICKER_SELECT =
  "id, name, slug, price_minor, stock, status, created_at, vendor_id, vendor:vendors!inner(name, slug, status, is_accepting_orders), category:categories(id, name, slug), product_images(path, alt, position)";

function firstOrNull<T>(value: Embedded<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function productPickerRowToItem(
  row: ProductPickerRow,
): ProductPickerItem | null {
  const vendor = firstOrNull(row.vendor);
  if (!vendor) return null;

  const category = firstOrNull(row.category);
  const images = [...(row.product_images ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    priceMinor: row.price_minor,
    stock: row.stock,
    status: row.status,
    createdAt: row.created_at,
    vendorName: vendor.name,
    vendorSlug: vendor.slug,
    vendorStatus: vendor.status,
    vendorAcceptingOrders: vendor.is_accepting_orders,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    categorySlug: category?.slug ?? null,
    imagePath: images[0]?.path ?? null,
    imageAlt: images[0]?.alt ?? null,
  };
}

export function productPickerRowsToItems(
  rows: readonly ProductPickerRow[],
): ProductPickerItem[] {
  return rows.flatMap((row) => {
    const item = productPickerRowToItem(row);
    return item ? [item] : [];
  });
}

/** Keeps user input literal instead of letting `%`/`_` widen the match. */
export function normalizeProductPickerSearch(value: unknown): string {
  return String(value ?? "")
    .replace(/[%_\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PRODUCT_PICKER_SEARCH_MAX);
}

export function parseProductPickerStatus(
  value: unknown,
): ProductPickerStatusFilter {
  return (PRODUCT_PICKER_STATUS_FILTERS as readonly string[]).includes(
    String(value ?? ""),
  )
    ? (String(value) as ProductPickerStatusFilter)
    : "all";
}

export function parseProductPickerSort(value: unknown): ProductPickerSort {
  return (PRODUCT_PICKER_SORTS as readonly string[]).includes(
    String(value ?? ""),
  )
    ? (String(value) as ProductPickerSort)
    : "newest";
}

export function parseProductPickerQuery(
  input: ProductPickerQueryInput,
): ProductPickerQuery {
  const categoryId = String(input.categoryId ?? "").trim();

  return {
    productQuery: normalizeProductPickerSearch(input.productQuery),
    vendorQuery: normalizeProductPickerSearch(input.vendorQuery),
    categoryId: isUuid(categoryId) ? categoryId : null,
    status: parseProductPickerStatus(input.status),
    sort: parseProductPickerSort(input.sort),
    page: parsePage(
      typeof input.page === "string" || typeof input.page === "number"
        ? String(input.page)
        : undefined,
    ),
  };
}

export function productPickerSortOrders(
  sort: ProductPickerSort,
): Array<{ column: "created_at" | "name" | "price_minor" | "id"; ascending: boolean }> {
  if (sort === "oldest") {
    return [
      { column: "created_at", ascending: true },
      { column: "id", ascending: true },
    ];
  }
  if (sort === "name") {
    return [
      { column: "name", ascending: true },
      { column: "id", ascending: true },
    ];
  }
  if (sort === "price-asc") {
    return [
      { column: "price_minor", ascending: true },
      { column: "id", ascending: true },
    ];
  }
  if (sort === "price-desc") {
    return [
      { column: "price_minor", ascending: false },
      { column: "id", ascending: false },
    ];
  }
  return [
    { column: "created_at", ascending: false },
    { column: "id", ascending: false },
  ];
}

export function isProductSelected(
  selection: readonly ProductPickerItem[],
  productId: string,
): boolean {
  return selection.some((item) => item.id === productId);
}

export function addProductToSelection(
  selection: readonly ProductPickerItem[],
  product: ProductPickerItem,
):
  | { ok: true; selection: ProductPickerItem[] }
  | { ok: false; selection: ProductPickerItem[]; error: string } {
  if (isProductSelected(selection, product.id)) {
    return { ok: true, selection: [...selection] };
  }

  if (selection.length >= PRODUCT_PICKER_MAX_SELECTION) {
    return {
      ok: false,
      selection: [...selection],
      error: `You can select at most ${PRODUCT_PICKER_MAX_SELECTION} products.`,
    };
  }

  return { ok: true, selection: [...selection, product] };
}

export function removeProductFromSelection(
  selection: readonly ProductPickerItem[],
  productId: string,
): ProductPickerItem[] {
  return selection.filter((item) => item.id !== productId);
}

export function moveProductInSelection(
  selection: readonly ProductPickerItem[],
  productId: string,
  direction: "up" | "down",
): ProductPickerItem[] {
  const index = selection.findIndex((item) => item.id === productId);
  if (index === -1) return [...selection];

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= selection.length) return [...selection];

  const next = [...selection];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function productSelectionIds(
  selection: readonly ProductPickerItem[],
): string[] {
  return selection.map((item) => item.id);
}

export function productSelectionEquals(
  left: readonly ProductPickerItem[],
  right: readonly ProductPickerItem[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.id === right[index]?.id);
}

export function isProductSelectionDirty(
  selection: readonly ProductPickerItem[],
  savedSelection: readonly ProductPickerItem[],
): boolean {
  return !productSelectionEquals(selection, savedSelection);
}

export function productAvailabilityNote(item: ProductPickerItem): string | null {
  if (item.status !== "active") {
    return item.status === "draft"
      ? "Draft, not publicly visible"
      : "Archived, not publicly visible";
  }
  if (item.vendorStatus !== "active") {
    return `Shop ${item.vendorStatus}, not publicly visible`;
  }
  if (!item.vendorAcceptingOrders) return "Shop paused for orders";
  return null;
}

export function isProductPubliclyAvailable(item: ProductPickerItem): boolean {
  return (
    item.status === "active" &&
    item.vendorStatus === "active" &&
    item.vendorAcceptingOrders
  );
}
