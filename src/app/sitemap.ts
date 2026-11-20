import type { MetadataRoute } from "next";

import {
  getCategories,
  getOccasions,
  getShops,
  loadSitemapProducts,
} from "@/lib/catalog";
import { getSiteUrl } from "@/lib/site-url";

// The sitemap lists live catalog data, so it is generated per request rather
// than prerendered at build time: prerendering would bake in stale entries
// and require a live database during `next build` (which CI does not have).
export const dynamic = "force-dynamic";

const STATIC_PATHS = [
  "/",
  "/occasions",
  "/categories",
  "/shops",
  "/help",
  "/delivery-returns",
  "/contact",
  "/privacy",
  "/terms",
  "/refund-policy",
] as const;

function url(path: string): string {
  return new URL(path, getSiteUrl({ fallbackToProductionOnLocalhost: true })).toString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, occasions, shops, products] = await Promise.all([
    getCategories(),
    getOccasions(),
    getShops(),
    loadSitemapProducts(),
  ]);

  return [
    ...STATIC_PATHS.map((path) => ({
      url: url(path),
      changeFrequency: path === "/" ? ("daily" as const) : ("weekly" as const),
      priority: path === "/" ? 1 : 0.6,
    })),
    ...categories.map((category) => ({
      url: url(`/categories/${encodeURIComponent(category.slug)}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...occasions.map((occasion) => ({
      url: url(`/occasions/${encodeURIComponent(occasion.slug)}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...shops.map((shop) => ({
      url: url(`/shops/${encodeURIComponent(shop.slug)}`),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...products.map((product) => ({
      url: url(
        `/shops/${encodeURIComponent(product.vendorSlug)}/${encodeURIComponent(product.slug)}`,
      ),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
