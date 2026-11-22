import { getSiteUrl } from "@/lib/site-url";

export type BreadcrumbJsonLdItem = {
  /** Visible breadcrumb label, e.g. "Home" or the shop name. */
  name: string;
  /** Site path for the level, e.g. "/" or "/shops/nile-gifts". */
  path: string;
};

/**
 * schema.org BreadcrumbList for a real navigation path (P1-16, L-16).
 * Callers pass exactly the levels the page actually links — the last
 * item is the page itself, whose path is its canonical URL. Never pass
 * a level the site does not link.
 */
export function breadcrumbJsonLd(items: BreadcrumbJsonLdItem[]) {
  const base = getSiteUrl({ fallbackToProductionOnLocalhost: true });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, base).toString(),
    })),
  };
}
