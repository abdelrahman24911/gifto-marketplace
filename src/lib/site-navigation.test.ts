import { describe, expect, it } from "vitest";

import { buildStoreNav } from "@/lib/site-navigation";

describe("buildStoreNav", () => {
  it("builds Home, Occasions, Categories and Shops from live slugs", () => {
    const nav = buildStoreNav({
      categories: [
        { name: "Flowers", slug: "flowers" },
        { name: "Gift Boxes", slug: "gift-boxes" },
      ],
      occasions: [{ name: "Graduation", slug: "graduation" }],
      labels: { home: "Home", occasions: "Occasions", categories: "Categories", shops: "Shops" },
    });

    expect(nav.map((item) => item.label)).toEqual([
      "Home",
      "Occasions",
      "Categories",
      "Shops",
    ]);
    expect(nav[1].items).toEqual([
      { href: "/occasions/graduation", label: "Graduation" },
    ]);
    expect(nav[2].items).toEqual([
      { href: "/categories/flowers", label: "Flowers" },
      { href: "/categories/gift-boxes", label: "Gift Boxes" },
    ]);
    expect(nav[3].items).toBeUndefined();
  });

  it("shows the corrected Ramadan label while keeping the live slug", () => {
    const nav = buildStoreNav({
      categories: [],
      occasions: [{ name: "Ramdan Night", slug: "ramdan-night" }],
      labels: { home: "Home", occasions: "Occasions", categories: "Categories", shops: "Shops" },
    });

    expect(nav[1].items).toEqual([
      { href: "/occasions/ramdan-night", label: "Ramadan Night" },
    ]);
  });

  it("still offers the directory link when a listing read is empty", () => {
    const nav = buildStoreNav({ categories: [], occasions: [], labels: { home: "Home", occasions: "Occasions", categories: "Categories", shops: "Shops" }, });

    expect(nav[1]).toMatchObject({ href: "/occasions", items: [] });
    expect(nav[2]).toMatchObject({ href: "/categories", items: [] });
  });
});
