import { occasionDisplayName } from "@/lib/occasion-display";

export type StoreNavLink = {
  label: string;
  href: string;
};

export type StoreNavItem = StoreNavLink & {
  /** When present, the item opens a dropdown instead of navigating directly. */
  items?: StoreNavLink[];
};

type NamedSlug = {
  name: string;
  slug: string;
};

/**
 * Builds the storefront navigation from the same cached catalogue reads used
 * elsewhere. Empty arrays are intentional: the dropdown still offers a link to
 * the full directory, so navigation never dead-ends during an outage.
 *
 * Top-level labels come from the caller (translated in the header); category
 * and occasion names are catalogue data and render as stored.
 */
export function buildStoreNav({
  categories,
  occasions,
  labels,
}: {
  categories: readonly NamedSlug[];
  occasions: readonly NamedSlug[];
  labels: { home: string; occasions: string; categories: string; shops: string };
}): StoreNavItem[] {
  return [
    { label: labels.home, href: "/" },
    {
      label: labels.occasions,
      href: "/occasions",
      items: occasions.map((occasion) => ({
        label: occasionDisplayName(occasion.slug, occasion.name),
        href: `/occasions/${occasion.slug}`,
      })),
    },
    {
      label: labels.categories,
      href: "/categories",
      items: categories.map((category) => ({
        label: category.name,
        href: `/categories/${category.slug}`,
      })),
    },
    { label: labels.shops, href: "/shops" },
  ];
}
