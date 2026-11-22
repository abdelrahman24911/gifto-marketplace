import { cache } from "react";

import {
  CATALOG_TAGS,
  cachedCatalogRead,
  type CatalogRead,
} from "@/lib/catalog-cache";
import {
  DEFAULT_PAGE_SIZE,
  pageWindow,
  type PageWindow,
} from "@/lib/pagination";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import {
  emptyGiftFinderPage,
  giftFinderBudgetRange,
  planGiftFinderCategories,
  toGiftFinderProduct,
  type GiftFinderPage,
  type GiftFinderQuery,
} from "@/lib/gift-finder";
import {
  workingHoursFromJson,
  type WorkingHours,
} from "@/lib/vendor-settings";

/**
 * Read helpers for the public storefront. Every page and section goes through
 * these so queries, ordering, and the product view-model stay consistent and
 * stay server-side (anon key + RLS). No mock data — an empty result is a real
 * empty result and the UI renders an empty state.
 *
 * List and directory reads use the cookie-less anon client and a shared,
 * tag-invalidated cache (`catalog-cache.ts`): they show the public view and
 * never depend on who is signed in. Free-text search is not cached.
 */

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  priceMinor: number;
  stock: number;
  imagePath: string | null;
  imageAlt: string | null;
  vendorId: string;
  vendorName: string | null;
  vendorSlug: string;
  vendorIsAcceptingOrders: boolean;
  categoryName: string | null;
  categorySlug: string | null;
};

export type CatalogImagePreview = {
  path: string;
  alt: string | null;
};

export type CatalogPreviewMap = Record<string, CatalogImagePreview[]>;

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type CatalogOccasion = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imagePath: string | null;
  imageAlt: string | null;
};

export type CatalogOccasionLookup = {
  occasion: CatalogOccasion;
  redirectFrom: string | null;
};

export type CatalogOccasionProducts = {
  items: CatalogProduct[];
  total: number;
};

/**
 * One page of a product list: the items on this page plus the exact total
 * across all pages. Lists never rely on a silent row cap — the total is what
 * the UI paginates against (H-13).
 */
export type CatalogProductPage = {
  items: CatalogProduct[];
  total: number;
};

/** Page request for a product list; pageSize is clamped to 1..100. */
export type CatalogPageOptions = {
  page?: number;
  pageSize?: number;
};

function normalizePageOptions(
  options: CatalogPageOptions = {},
): { window: PageWindow; pageSize: number } {
  const pageSize = Math.max(
    1,
    Math.min(
      Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE,
      100,
    ),
  );
  const window = pageWindow(options.page ?? 1, pageSize);
  return { window, pageSize: window.pageSize };
}

export type CatalogShop = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  governorate: string | null;
  logoPath: string | null;
  coverPath: string | null;
  workingHours: WorkingHours;
  prepTimeMinDays: number | null;
  prepTimeMaxDays: number | null;
  isAcceptingOrders: boolean;
};

type ShopRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  governorate: string | null;
  logo_path: string | null;
  cover_path: string | null;
  working_hours: Json;
  prep_time_min_days: number | null;
  prep_time_max_days: number | null;
  is_accepting_orders: boolean;
};

function toCatalogShop(row: ShopRow): CatalogShop {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    city: row.city,
    governorate: row.governorate,
    logoPath: row.logo_path,
    coverPath: row.cover_path,
    workingHours: workingHoursFromJson(row.working_hours),
    prepTimeMinDays: row.prep_time_min_days,
    prepTimeMaxDays: row.prep_time_max_days,
    isAcceptingOrders: row.is_accepting_orders,
  };
}

type OccasionRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_path: string | null;
  image_alt: string | null;
};

function toCatalogOccasion(row: OccasionRow): CatalogOccasion {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imagePath: row.image_path,
    imageAlt: row.image_alt,
  };
}

type ImageRow = { path: string; alt: string | null; position: number };

type VendorRow = {
  id: string;
  name: string;
  slug: string;
  is_accepting_orders: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  price_minor: number;
  stock: number;
  vendor_id: string;
  vendor?: VendorRow | VendorRow[] | null;
  category?: { name: string; slug: string } | { name: string; slug: string }[] | null;
  product_images: ImageRow[] | null;
};

const PRODUCT_SELECT =
  "id, name, slug, price_minor, stock, vendor_id, vendor:public_vendors!inner(id, name, slug, is_accepting_orders), category:categories(name, slug), product_images(path, alt, position)";

const OCCASION_SELECT = "id, name, slug, description, image_path, image_alt";

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toCatalogProducts(rows: ProductRow[]): CatalogProduct[] {
  return rows.flatMap((row) => {
    const vendor = firstOrSelf(row.vendor);
    if (!vendor) return [];

    const images = [...(row.product_images ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    const category = firstOrSelf(row.category);

    return [
      {
        id: row.id,
        name: row.name,
        slug: row.slug,
        priceMinor: row.price_minor,
        stock: row.stock,
        imagePath: images[0]?.path ?? null,
        imageAlt: images[0]?.alt ?? null,
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorSlug: vendor.slug,
        vendorIsAcceptingOrders: vendor.is_accepting_orders,
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
      },
    ];
  });
}

/**
 * A load that distinguishes "no rows" from "the read failed". Storefront pages
 * use this to render an honest error state instead of silently mistaking a
 * failed query for an empty catalogue.
 */
export type Load<T> = { ok: true; data: T } | { ok: false };

const FAILED_LOAD: CatalogRead<{ ok: false }> = {
  value: { ok: false },
  cacheable: false,
};

export const loadCategories = cachedCatalogRead(
  "categories",
  async (): Promise<CatalogRead<Load<CatalogCategory[]>>> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description")
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("name", { ascending: true });

    if (error) return FAILED_LOAD;
    return { value: { ok: true, data: data ?? [] }, cacheable: true };
  },
  [CATALOG_TAGS.categories],
);

const readCategory = cachedCatalogRead(
  "category",
  async (slug: string): Promise<CatalogRead<Load<CatalogCategory | null>>> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) return FAILED_LOAD;
    // Unknown slugs come straight from the URL; never store them.
    return { value: { ok: true, data: data ?? null }, cacheable: !!data };
  },
  [CATALOG_TAGS.categories],
);

/** Also memoized per request so generateMetadata and the page share one lookup. */
export const loadCategory = cache(readCategory);

export const loadProductsByCategory = cachedCatalogRead(
  "products-by-category",
  async (
    categoryId: string,
    options: CatalogPageOptions = {},
  ): Promise<CatalogRead<Load<CatalogProductPage>>> => {
    const { window } = normalizePageOptions(options);
    const supabase = createPublicClient();
    const { data, error, count } = await supabase
      .from("products")
      .select(PRODUCT_SELECT, { count: "exact" })
      .eq("category_id", categoryId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(window.from, window.to)
      .returns<ProductRow[]>();

    // The id tiebreak keeps page 2+ stable when created_at values tie.
    if (error || typeof count !== "number") return FAILED_LOAD;
    return {
      value: {
        ok: true,
        data: { items: toCatalogProducts(data ?? []), total: count },
      },
      cacheable: true,
    };
  },
  [CATALOG_TAGS.catalog, CATALOG_TAGS.categories, CATALOG_TAGS.shops],
);

export async function getCategories(): Promise<CatalogCategory[]> {
  const result = await loadCategories();
  return result.ok ? result.data : [];
}

/**
 * Live products by id, deliberately NOT cached: reorder needs today's
 * price and stock, not the catalog cache's snapshot. Only active
 * products from shops that are still published come back; anything
 * missing is treated as unavailable by the caller.
 */
export async function loadLiveProductsByIds(
  ids: (string | null)[],
): Promise<CatalogProduct[]> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return [];
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .in("id", unique)
    .eq("status", "active")
    .returns<ProductRow[]>();
  if (error) return [];
  return toCatalogProducts(data ?? []);
}

export const loadOccasions = cachedCatalogRead(
  "occasions",
  async (): Promise<CatalogRead<Load<CatalogOccasion[]>>> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("occasions")
      .select(OCCASION_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<OccasionRow[]>();

    if (error) return FAILED_LOAD;
    return {
      value: { ok: true, data: (data ?? []).map(toCatalogOccasion) },
      cacheable: true,
    };
  },
  [CATALOG_TAGS.occasions],
);

export async function getOccasions(): Promise<CatalogOccasion[]> {
  const result = await loadOccasions();
  return result.ok ? result.data : [];
}

const readOccasion = cachedCatalogRead(
  "occasion",
  async (
    slug: string,
  ): Promise<CatalogRead<Load<CatalogOccasionLookup | null>>> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("occasions")
      .select(OCCASION_SELECT)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle<OccasionRow>();

    if (error) return FAILED_LOAD;
    if (data) {
      return {
        value: {
          ok: true,
          data: { occasion: toCatalogOccasion(data), redirectFrom: null },
        },
        cacheable: true,
      };
    }

    const { data: redirect, error: redirectError } = await supabase
      .from("occasion_slug_redirects")
      .select("occasion_id")
      .eq("old_slug", slug)
      .maybeSingle();

    if (redirectError) return FAILED_LOAD;
    if (!redirect) {
      // Unknown slugs come straight from the URL; never store them.
      return { value: { ok: true, data: null }, cacheable: false };
    }

    const { data: target, error: targetError } = await supabase
      .from("occasions")
      .select(OCCASION_SELECT)
      .eq("id", redirect.occasion_id)
      .eq("is_active", true)
      .maybeSingle<OccasionRow>();

    if (targetError) return FAILED_LOAD;
    if (!target) {
      return { value: { ok: true, data: null }, cacheable: false };
    }

    return {
      value: {
        ok: true,
        data: { occasion: toCatalogOccasion(target), redirectFrom: slug },
      },
      cacheable: true,
    };
  },
  [CATALOG_TAGS.occasions],
);

/** Also memoized per request so generateMetadata and the page share one lookup. */
export const loadOccasion = cache(readOccasion);

export const loadProductsByOccasion = cachedCatalogRead(
  "products-by-occasion",
  async (
    occasionId: string,
    options: CatalogPageOptions = {},
  ): Promise<CatalogRead<Load<CatalogOccasionProducts>>> => {
    const { window, pageSize } = normalizePageOptions(options);
    const supabase = createPublicClient();
    const { data: ranking, error } = await supabase.rpc(
      "get_occasion_products",
      {
        p_occasion_id: occasionId,
        p_limit: pageSize,
        p_offset: window.from,
      },
    );

    if (error) return FAILED_LOAD;

    const rows = ranking ?? [];
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return {
        value: { ok: true, data: { items: [], total: 0 } },
        cacheable: true,
      };
    }

    const { data: products, error: productError } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .in("id", ids)
      .eq("status", "active")
      .returns<ProductRow[]>();

    if (productError) return FAILED_LOAD;

    const productById = new Map(
      toCatalogProducts(products ?? []).map((product) => [product.id, product]),
    );
    const items = ids.flatMap((id) => {
      const product = productById.get(id);
      return product ? [product] : [];
    });

    return {
      value: {
        ok: true,
        data: { items, total: rows[0]?.total_count ?? items.length },
      },
      cacheable: true,
    };
  },
  [CATALOG_TAGS.catalog, CATALOG_TAGS.occasions, CATALOG_TAGS.shops],
);

export const loadShops = cachedCatalogRead(
  "shops",
  async (limit?: number): Promise<CatalogRead<Load<CatalogShop[]>>> => {
    const supabase = createPublicClient();
    let query = supabase
      .from("public_vendors")
      .select("id, name, slug, description, city, governorate, logo_path, cover_path, working_hours, prep_time_min_days, prep_time_max_days, is_accepting_orders")
      .order("name", { ascending: true });

    if (limit) query = query.limit(limit);

    const { data, error } = await query.returns<ShopRow[]>();
    if (error) return FAILED_LOAD;
    return {
      value: { ok: true, data: (data ?? []).map(toCatalogShop) },
      cacheable: true,
    };
  },
  [CATALOG_TAGS.shops],
);

type PreviewRow = {
  category_id: string | null;
  vendor_id: string;
  vendor?: unknown;
  product_images: ImageRow[] | null;
};

const PREVIEW_IMAGE_COUNT = 3;
const PREVIEW_PRODUCT_LIMIT = 500;

function addImagePreview(
  map: CatalogPreviewMap,
  key: string,
  preview: CatalogImagePreview,
) {
  const previews = map[key] ?? [];
  if (
    previews.length >= PREVIEW_IMAGE_COUNT ||
    previews.some((existing) => existing.path === preview.path)
  ) {
    return;
  }
  map[key] = [...previews, preview];
}

const readStorefrontPreviews = cachedCatalogRead(
  "storefront-previews",
  async (): Promise<
    CatalogRead<
      Load<{ categories: CatalogPreviewMap; shops: CatalogPreviewMap }>
    >
  > => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        "category_id, vendor_id, vendor:public_vendors!inner(id), product_images(path, alt, position)",
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(PREVIEW_PRODUCT_LIMIT)
      .returns<PreviewRow[]>();

    if (error) return FAILED_LOAD;

    const categories: CatalogPreviewMap = {};
    const shops: CatalogPreviewMap = {};

    for (const row of data ?? []) {
      const image = [...(row.product_images ?? [])]
        .sort((a, b) => a.position - b.position)
        .find((candidate) => candidate.path);
      if (!image) continue;

      const preview = { path: image.path, alt: image.alt };
      if (row.category_id) {
        addImagePreview(categories, row.category_id, preview);
      }
      addImagePreview(shops, row.vendor_id, preview);
    }

    return {
      value: { ok: true, data: { categories, shops } },
      cacheable: true,
    };
  },
  [CATALOG_TAGS.catalog, CATALOG_TAGS.categories, CATALOG_TAGS.shops],
);

export async function loadCategoryPreviews(): Promise<Load<CatalogPreviewMap>> {
  const result = await readStorefrontPreviews();
  return result.ok
    ? { ok: true, data: result.data.categories }
    : { ok: false };
}

export async function loadShopPreviews(): Promise<Load<CatalogPreviewMap>> {
  const result = await readStorefrontPreviews();
  return result.ok ? { ok: true, data: result.data.shops } : { ok: false };
}

const readShop = cachedCatalogRead(
  "shop",
  async (slug: string): Promise<CatalogRead<Load<CatalogShop | null>>> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("public_vendors")
      .select("id, name, slug, description, city, governorate, logo_path, cover_path, working_hours, prep_time_min_days, prep_time_max_days, is_accepting_orders")
      .eq("slug", slug)
      .maybeSingle<ShopRow>();

    if (error) return FAILED_LOAD;
    // Unknown slugs come straight from the URL; never store them.
    return {
      value: { ok: true, data: data ? toCatalogShop(data) : null },
      cacheable: !!data,
    };
  },
  [CATALOG_TAGS.shops],
);

/** Also memoized per request so generateMetadata and the page share one lookup. */
export const loadShop = cache(readShop);

export const loadProductsByShop = cachedCatalogRead(
  "products-by-shop",
  async (
    vendorId: string,
    options: CatalogPageOptions = {},
  ): Promise<CatalogRead<Load<CatalogProductPage>>> => {
    const { window } = normalizePageOptions(options);
    const supabase = createPublicClient();
    const { data, error, count } = await supabase
      .from("products")
      .select(PRODUCT_SELECT, { count: "exact" })
      .eq("vendor_id", vendorId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(window.from, window.to)
      .returns<ProductRow[]>();

    // The id tiebreak keeps page 2+ stable when created_at values tie.
    if (error || typeof count !== "number") return FAILED_LOAD;
    return {
      value: {
        ok: true,
        data: { items: toCatalogProducts(data ?? []), total: count },
      },
      cacheable: true,
    };
  },
  [CATALOG_TAGS.catalog, CATALOG_TAGS.shops],
);

export async function getShops(limit?: number): Promise<CatalogShop[]> {
  const result = await loadShops(limit);
  return result.ok ? result.data : [];
}

const readNewArrivals = cachedCatalogRead(
  "new-arrivals",
  async (limit: number): Promise<CatalogRead<Load<CatalogProduct[]>>> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ProductRow[]>();

    if (error) return FAILED_LOAD;
    return {
      value: { ok: true, data: toCatalogProducts(data ?? []) },
      cacheable: true,
    };
  },
  [CATALOG_TAGS.catalog, CATALOG_TAGS.categories, CATALOG_TAGS.shops],
);

/** Newest active products across every shop, newest first. */
export async function loadNewArrivals(
  limit = 8,
): Promise<Load<CatalogProduct[]>> {
  return readNewArrivals(limit);
}

/** Convenience wrapper that preserves the empty-on-failure behaviour. */
export async function getNewArrivals(limit = 8): Promise<CatalogProduct[]> {
  const result = await loadNewArrivals(limit);
  return result.ok ? result.data : [];
}

type GiftFinderCategoryRow = {
  id: string;
  slug: string;
};

/**
 * One server-side page of Gift Finder matches. Filtering, counting and
 * pagination all happen in the database so no eligible product is hidden by a
 * client-side pool cap.
 */
export async function loadGiftFinderPage(
  query: GiftFinderQuery,
): Promise<Load<GiftFinderPage>> {
  const plan = planGiftFinderCategories(query);
  if (plan.occasionUnsupported) {
    return {
      ok: true,
      data: emptyGiftFinderPage(query, true),
    };
  }

  const supabase = createPublicClient();
  let categoryIds: string[] | null = null;

  if (plan.categorySlugs) {
    if (plan.categorySlugs.length === 0) {
      return { ok: true, data: emptyGiftFinderPage(query) };
    }

    const { data: categories, error: categoryError } = await supabase
      .from("categories")
      .select("id, slug")
      .in("slug", plan.categorySlugs)
      .eq("is_active", true)
      .returns<GiftFinderCategoryRow[]>();

    if (categoryError) return { ok: false };

    categoryIds = (categories ?? []).map((category) => category.id);
    if (categoryIds.length === 0) {
      return { ok: true, data: emptyGiftFinderPage(query) };
    }
  }

  const budget = giftFinderBudgetRange(query.budget);
  let productsQuery = supabase
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .eq("status", "active");

  if (categoryIds) {
    productsQuery = productsQuery.in("category_id", categoryIds);
  }
  if (budget.minMinor !== null) {
    productsQuery = productsQuery.gte("price_minor", budget.minMinor);
  }
  if (budget.maxMinor !== null) {
    productsQuery = productsQuery.lt("price_minor", budget.maxMinor);
  }

  const { data, error, count } = await productsQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(query.offset, query.offset + query.limit - 1)
    .returns<ProductRow[]>();

  if (error || count === null) return { ok: false };

  const rows = data ?? [];
  const products = toCatalogProducts(rows).flatMap((product) => {
    const mapped = toGiftFinderProduct(product);
    return mapped ? [mapped] : [];
  });

  return {
    ok: true,
    data: {
      products,
      total: count,
      offset: query.offset,
      limit: query.limit,
      hasMore: query.offset + rows.length < count,
      occasionUnsupported: false,
    },
  };
}

type SitemapProductRow = {
  slug: string;
  vendor: { slug: string } | { slug: string }[] | null;
};

export type SitemapProduct = {
  slug: string;
  vendorSlug: string;
};

/**
 * Public product URLs for the sitemap. The join is `!inner`, so products whose
 * shop is not publicly visible cannot create an orphaned sitemap entry.
 */
export async function loadSitemapProducts(
  limit = 1_000,
): Promise<SitemapProduct[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select("slug, vendor:public_vendors!inner(slug)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Math.floor(limit), 5_000)))
    .returns<SitemapProductRow[]>();

  if (error) return [];

  return (data ?? []).flatMap((row) => {
    const vendor = firstOrSelf(row.vendor);
    return vendor ? [{ slug: row.slug, vendorSlug: vendor.slug }] : [];
  });
}

const readProductsByBudget = cachedCatalogRead(
  "products-by-budget",
  async (
    minMinor: number | null,
    maxMinor: number | null,
    limit: number,
  ): Promise<CatalogRead<CatalogProduct[]>> => {
    const supabase = createPublicClient();
    let query = supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("status", "active")
      .order("price_minor", { ascending: true })
      .limit(limit);

    if (minMinor !== null) query = query.gte("price_minor", minMinor);
    if (maxMinor !== null) query = query.lte("price_minor", maxMinor);

    const { data, error } = await query.returns<ProductRow[]>();
    return {
      value: toCatalogProducts(data ?? []),
      cacheable: !error,
    };
  },
  [CATALOG_TAGS.catalog, CATALOG_TAGS.categories, CATALOG_TAGS.shops],
);

/** Active products within a price band (integer piastres). */
export function getProductsByBudget(
  minMinor: number | null,
  maxMinor: number | null,
  limit = 4,
): Promise<CatalogProduct[]> {
  return readProductsByBudget(minMinor, maxMinor, limit);
}

export type SearchParams = {
  q?: string;
  categorySlug?: string;
  minMinor?: number | null;
  maxMinor?: number | null;
  page?: number;
  pageSize?: number;
};

export type SearchResult =
  | { ok: true; products: CatalogProduct[]; total: number }
  | { ok: false };

type SearchRankRow = {
  id: string;
  total_count: number;
};

/**
 * Text + category + price search over active products, one page at a time.
 *
 * Text matching lives in the search_products() RPC (migration 38): ranked
 * trigram search over name and description with a GIN index — name
 * matches first, description-only matches included. The application
 * never builds a LIKE pattern, so user input cannot inject wildcards
 * (L-12). Category and price filters are applied inside the RPC so the
 * total is the filtered total.
 */
export async function searchProducts({
  q,
  categorySlug,
  minMinor = null,
  maxMinor = null,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: SearchParams): Promise<SearchResult> {
  const supabase = await createClient();
  const { window, pageSize: limit } = normalizePageOptions({ page, pageSize });

  let categoryId: string | null = null;
  if (categorySlug) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!category) return { ok: true, products: [], total: 0 };
    categoryId = category.id;
  }

  const term = q?.trim() || null;
  const { data: ranking, error: rankingError } = await supabase.rpc(
    "search_products",
    {
      p_query: term,
      p_category_id: categoryId,
      p_min_minor: minMinor,
      p_max_minor: maxMinor,
      p_limit: limit,
      p_offset: window.from,
    },
  );

  if (rankingError) return { ok: false };

  const rows = (ranking ?? []) as SearchRankRow[];
  if (rows.length === 0) return { ok: true, products: [], total: 0 };

  const ids = rows.map((row) => row.id);
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .in("id", ids)
    .eq("status", "active")
    .returns<ProductRow[]>();

  if (error) return { ok: false };

  const productById = new Map(
    toCatalogProducts(data ?? []).map((product) => [product.id, product]),
  );
  const products = ids.flatMap((id) => {
    const product = productById.get(id);
    return product ? [product] : [];
  });

  return { ok: true, products, total: rows[0]?.total_count ?? products.length };
}
