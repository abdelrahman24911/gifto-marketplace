"use server";

import { createClient } from "@/lib/supabase/server";
import type { WishlistItem } from "@/lib/wishlist";

/**
 * Signed-in wishlist persistence (migration 47, UX Batch 1).
 *
 * Guests keep a browser-local wishlist only. Signed-in customers get the
 * same list in the database, so it follows the account across devices:
 * the provider loads this copy on mount and every toggle writes through
 * to it. RLS is the authorization boundary (owner-only rows); these
 * actions only ever touch the caller's own user id.
 *
 * Adding twice is a no-op (unique constraint), never an error — the
 * client toggle is the source of truth for the button state.
 */

type WishlistVendorRow = {
  id: string;
  name: string;
  slug: string;
};

type WishlistProductRow = {
  id: string;
  name: string;
  slug: string;
  price_minor: number;
  stock: number;
  vendor_id: string;
  product_images: { path: string; position: number }[] | null;
};

type WishlistRow = {
  product_id: string;
  product: WishlistProductRow | WishlistProductRow[] | null;
};

export async function listWishlistItems(): Promise<WishlistItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("wishlists")
    .select(
      "product_id, product:products(id, name, slug, price_minor, stock, vendor_id, product_images(path, position))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<WishlistRow[]>();

  if (error || !data) return [];

  const products: WishlistProductRow[] = [];
  for (const row of data) {
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    if (product) products.push(product);
  }

  const vendorIds = [...new Set(products.map((product) => product.vendor_id))];
  const vendorsById = new Map<string, WishlistVendorRow>();
  if (vendorIds.length > 0) {
    const { data: vendors } = await supabase
      .from("public_vendors")
      .select("id, name, slug")
      .in("id", vendorIds);
    for (const vendor of vendors ?? []) {
      vendorsById.set(vendor.id, vendor);
    }
  }

  const items: WishlistItem[] = [];
  for (const product of products) {
    const vendor = vendorsById.get(product.vendor_id);
    if (!vendor) continue;
    const images = [...(product.product_images ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    items.push({
      productId: product.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorSlug: vendor.slug,
      name: product.name,
      slug: product.slug,
      priceMinor: product.price_minor,
      imagePath: images[0]?.path ?? null,
      stock: product.stock,
    });
  }
  return items;
}

export async function addWishlistItem(
  productId: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("wishlists")
    .upsert(
      { user_id: user.id, product_id: productId },
      { onConflict: "user_id,product_id", ignoreDuplicates: true },
    );
  return { ok: !error };
}

export async function removeWishlistItem(
  productId: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("wishlists")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);
  return { ok: !error };
}
