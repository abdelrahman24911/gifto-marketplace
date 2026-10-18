import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Read helpers for the public storefront. Every page and section goes through
 * these so queries, ordering, and the product view-model stay consistent and
 * stay server-side (anon key + RLS). No mock data — an empty result is a real
 * empty result and the UI renders an empty state.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  priceMinor: number;
  stock: number;
  imagePath: string | null;
  imageAlt: string | null;
  vendorName: string | null;
  vendorSlug: string;
  categoryName: string | null;
  categorySlug: string | null;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type CatalogShop = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  governorate: string | null;
};

type ImageRow = { path: string; alt: string | null; position: number };

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  price_minor: number;
  stock: number;
  vendor_id: string;
  category?: { name: string; slug: string } | { name: string; slug: string }[] | null;
  product_images: ImageRow[] | null;
};

const PRODUCT_SELECT =
  "id, name, slug, price_minor, stock, vendor_id, category:categories(name, slug), product_images(path, alt, position)";

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function vendorsById(
  supabase: Supabase,
  ids: string[],
): Promise<Map<string, { name: string; slug: string }>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from("public_vendors")
    .select("id, name, slug")
    .in("id", unique);

  return new Map((data ?? []).map((v) => [v.id, { name: v.name, slug: v.slug }]));
}

async function toCatalogProducts(
  supabase: Supabase,
  rows: ProductRow[],
): Promise<CatalogProduct[]> {
  const vendors = await vendorsById(
    supabase,
    rows.map((row) => row.vendor_id),
  );

  return rows.flatMap((row) => {
    const vendor = vendors.get(row.vendor_id);
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
        vendorName: vendor.name,
        vendorSlug: vendor.slug,
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

export async function loadCategories(): Promise<Load<CatalogCategory[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, description")
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (error) return { ok: false };
  return { ok: true, data: data ?? [] };
}

/** Cached per request so generateMetadata and the page share one query. */
export const loadCategory = cache(
  async (slug: string): Promise<Load<CatalogCategory | null>> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) return { ok: false };
    return { ok: true, data: data ?? null };
  },
);

export async function loadProductsByCategory(
  categoryId: string,
  limit = 60,
): Promise<Load<CatalogProduct[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("category_id", categoryId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false };
  return { ok: true, data: await toCatalogProducts(supabase, data ?? []) };
}

export async function getCategories(): Promise<CatalogCategory[]> {
  const result = await loadCategories();
  return result.ok ? result.data : [];
}

export async function loadShops(limit?: number): Promise<Load<CatalogShop[]>> {
  const supabase = await createClient();
  let query = supabase
    .from("public_vendors")
    .select("id, name, slug, description, city, governorate")
    .order("name", { ascending: true });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) return { ok: false };
  return { ok: true, data: data ?? [] };
}

/** Cached per request so generateMetadata and the page share one query. */
export const loadShop = cache(
  async (slug: string): Promise<Load<CatalogShop | null>> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("public_vendors")
      .select("id, name, slug, description, city, governorate")
      .eq("slug", slug)
      .maybeSingle();

    if (error) return { ok: false };
    return { ok: true, data: data ?? null };
  },
);

export async function loadProductsByShop(
  vendorId: string,
  limit = 60,
): Promise<Load<CatalogProduct[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false };
  return { ok: true, data: await toCatalogProducts(supabase, data ?? []) };
}

export async function getShops(limit?: number): Promise<CatalogShop[]> {
  const result = await loadShops(limit);
  return result.ok ? result.data : [];
}

/** Newest active products across every shop, newest first. */
export async function getNewArrivals(limit = 8): Promise<CatalogProduct[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  return toCatalogProducts(supabase, data ?? []);
}

/** Active products within a price band (integer piastres). */
export async function getProductsByBudget(
  minMinor: number | null,
  maxMinor: number | null,
  limit = 4,
): Promise<CatalogProduct[]> {
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .order("price_minor", { ascending: true })
    .limit(limit);

  if (minMinor !== null) query = query.gte("price_minor", minMinor);
  if (maxMinor !== null) query = query.lte("price_minor", maxMinor);

  const { data } = await query;
  return toCatalogProducts(supabase, data ?? []);
}

export type SearchParams = {
  q?: string;
  categorySlug?: string;
  minMinor?: number | null;
  maxMinor?: number | null;
  limit?: number;
};

export type SearchResult =
  | { ok: true; products: CatalogProduct[] }
  | { ok: false };

/** Text + category + price search over active products. */
export async function searchProducts({
  q,
  categorySlug,
  minMinor = null,
  maxMinor = null,
  limit = 60,
}: SearchParams): Promise<SearchResult> {
  const supabase = await createClient();

  let categoryId: string | null = null;
  if (categorySlug) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", categorySlug)
      .eq("is_active", true)
      .maybeSingle();
    if (!category) return { ok: true, products: [] };
    categoryId = category.id;
  }

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit ?? 48);

  const term = q?.trim();
  if (term) query = query.ilike("name", `%${term}%`);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (typeof minMinor === "number") query = query.gte("price_minor", minMinor);
  if (typeof maxMinor === "number") query = query.lte("price_minor", maxMinor);

  const { data, error } = await query;
  if (error) return { ok: false };

  return { ok: true, products: await toCatalogProducts(supabase, data ?? []) };
}
