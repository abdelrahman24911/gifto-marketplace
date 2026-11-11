import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PRODUCT_PICKER_PAGE_SIZE,
  PRODUCT_PICKER_SELECT,
  productPickerRowsToItems,
  productPickerSortOrders,
  type ProductPickerCategoryOption,
  type ProductPickerItem,
  type ProductPickerQuery,
  type ProductPickerRow,
} from "@/lib/occasion-products";
import { pageWindow } from "@/lib/pagination";
import type { Database } from "@/lib/supabase/database.types";

type ServerClient = SupabaseClient<Database>;

export type ProductPickerPageData = {
  items: ProductPickerItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ProductPickerPageLoad =
  | { ok: true; data: ProductPickerPageData }
  | { ok: false; error: string };

export async function loadProductPickerPage(
  supabase: ServerClient,
  query: ProductPickerQuery,
): Promise<ProductPickerPageLoad> {
  const range = pageWindow(query.page, PRODUCT_PICKER_PAGE_SIZE);

  let request = supabase
    .from("products")
    .select(PRODUCT_PICKER_SELECT, { count: "exact" });

  if (query.productQuery) {
    request = request.ilike("name", `%${query.productQuery}%`);
  }
  if (query.vendorQuery) {
    request = request.ilike("vendors.name", `%${query.vendorQuery}%`);
  }
  if (query.categoryId) {
    request = request.eq("category_id", query.categoryId);
  }
  if (query.status !== "all") {
    request = request.eq("status", query.status);
  }

  for (const order of productPickerSortOrders(query.sort)) {
    request = request.order(order.column, { ascending: order.ascending });
  }

  const { data, count, error } = await request
    .range(range.from, range.to)
    .returns<ProductPickerRow[]>();

  if (error) {
    return {
      ok: false,
      error: "Could not load products. Please try again.",
    };
  }

  return {
    ok: true,
    data: {
      items: productPickerRowsToItems(data ?? []),
      total: count ?? 0,
      page: range.page,
      pageSize: range.pageSize,
    },
  };
}

export async function loadSelectedProducts(
  supabase: ServerClient,
  occasionId: string,
): Promise<{ ok: true; items: ProductPickerItem[] } | { ok: false; error: string }> {
  const { data: links, error: linksError } = await supabase
    .from("occasion_products")
    .select("product_id, sort_order")
    .eq("occasion_id", occasionId)
    .order("sort_order", { ascending: true })
    .order("product_id", { ascending: true });

  if (linksError) {
    return {
      ok: false,
      error: "Could not load the selected products. Please try again.",
    };
  }

  const ids = (links ?? []).map((link) => link.product_id);
  if (ids.length === 0) return { ok: true, items: [] };

  const rows: ProductPickerRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error: productsError } = await supabase
      .from("products")
      .select(PRODUCT_PICKER_SELECT)
      .in("id", ids.slice(offset, offset + 100))
      .returns<ProductPickerRow[]>();

    if (productsError) {
      return {
        ok: false,
        error: "Could not load the selected products. Please try again.",
      };
    }

    rows.push(...(data ?? []));
  }

  const byId = new Map(
    productPickerRowsToItems(rows).map((item) => [item.id, item]),
  );

  return {
    ok: true,
    items: ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    }),
  };
}

export async function loadProductPickerCategories(
  supabase: ServerClient,
): Promise<
  | { ok: true; categories: ProductPickerCategoryOption[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return {
      ok: false,
      error: "Could not load categories. Please try again.",
    };
  }

  return { ok: true, categories: data ?? [] };
}
