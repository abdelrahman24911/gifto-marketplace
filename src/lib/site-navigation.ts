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
 */
export function buildStoreNav({
  categories,
  occasions,
}: {
  categories: readonly NamedSlug[];
  occasions: readonly NamedSlug[];
}): StoreNavItem[] {
  return [
    { label: "Home", href: "/" },
    {
      label: "Occasions",
      href: "/occasions",
      items: occasions.map((occasion) => ({
        label: occasionDisplayName(occasion.slug, occasion.name),
        href: `/occasions/${occasion.slug}`,
      })),
    },
    {
      label: "Categories",
      href: "/categories",
      items: categories.map((category) => ({
        label: category.name,
        href: `/categories/${category.slug}`,
      })),
    },
    { label: "Shops", href: "/shops" },
  ];
}
