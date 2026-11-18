import { describe, expect, it } from "vitest";

import type { CatalogProduct } from "@/lib/catalog";
import {
  GIFT_FINDER_BUDGET_BANDS,
  GIFT_FINDER_MAX_PAGE_SIZE,
  GIFT_FINDER_PAGE_SIZE,
  OCCASION_CATEGORY_SLUGS,
  RECIPIENT_CATEGORY_SLUGS,
  emptyGiftFinderPage,
  giftFinderBudgetRange,
  parseGiftFinderSearchParams,
  planGiftFinderCategories,
  toGiftFinderProduct,
  type GiftFinderSelection,
} from "@/lib/gift-finder";

const ANY_SELECTION: GiftFinderSelection = {
  recipient: "any",
  occasionSlug: null,
  budget: "any",
};

describe("gift finder budget bands", () => {
  it("defines exactly six buyer-facing bands", () => {
    expect(GIFT_FINDER_BUDGET_BANDS).toHaveLength(6);
  });

  it("places each boundary price in exactly one band", () => {
    const prices = [
      0,
      24_999,
      25_000,
      49_999,
      50_000,
      74_999,
      75_000,
      99_999,
      100_000,
      149_999,
      150_000,
      500_000,
    ];

    for (const price of prices) {
      const matching = GIFT_FINDER_BUDGET_BANDS.filter(
        (band) =>
          price >= band.minMinor &&
          (band.maxMinor === null || price < band.maxMinor),
      );

      expect(matching, `price ${price}`).toHaveLength(1);
    }
  });

  it("uses inclusive lower and exclusive upper query bounds", () => {
    expect(giftFinderBudgetRange("under-250")).toEqual({
      minMinor: 0,
      maxMinor: 25_000,
    });
    expect(giftFinderBudgetRange("250-500")).toEqual({
      minMinor: 25_000,
      maxMinor: 50_000,
    });
    expect(giftFinderBudgetRange("any")).toEqual({
      minMinor: null,
      maxMinor: null,
    });
  });

  it("keeps the open-ended 1,500+ band open", () => {
    expect(giftFinderBudgetRange("1500-plus")).toEqual({
      minMinor: 150_000,
      maxMinor: null,
    });
  });
});

describe("gift finder recipient and occasion mappings", () => {
  it("maps recipients to real category slugs", () => {
    expect(
      planGiftFinderCategories({ ...ANY_SELECTION, recipient: "kids" }),
    ).toEqual({
      categorySlugs: [...RECIPIENT_CATEGORY_SLUGS.kids],
      occasionUnsupported: false,
    });
    expect(RECIPIENT_CATEGORY_SLUGS.kids).toContain("toys-kids");
  });

  it("supports both the live and corrected Ramadan slugs", () => {
    expect(OCCASION_CATEGORY_SLUGS["ramdan-night"]).toEqual(
      OCCASION_CATEGORY_SLUGS["ramadan-night"],
    );
  });

  it("filters occasions through the editorial mapping", () => {
    expect(
      planGiftFinderCategories({
        ...ANY_SELECTION,
        occasionSlug: "ramdan-night",
      }),
    ).toEqual({
      categorySlugs: [...OCCASION_CATEGORY_SLUGS["ramdan-night"]],
      occasionUnsupported: false,
    });
  });

  it("returns an honest empty plan for an unmapped occasion", () => {
    expect(
      planGiftFinderCategories({
        ...ANY_SELECTION,
        occasionSlug: "birthday",
      }),
    ).toEqual({
      categorySlugs: [],
      occasionUnsupported: true,
    });
  });

  it("intersects recipient and occasion categories", () => {
    const plan = planGiftFinderCategories({
      recipient: "her",
      occasionSlug: "graduation",
      budget: "any",
    });

    expect(plan).toEqual({
      categorySlugs: ["flowers", "personalized-gifts", "gift-boxes"],
      occasionUnsupported: false,
    });
  });

  it("does not restrict categories when no mapping is active", () => {
    expect(planGiftFinderCategories(ANY_SELECTION)).toEqual({
      categorySlugs: null,
      occasionUnsupported: false,
    });
  });

  it("keeps every mapping value non-empty and unique", () => {
    const mappings = [
      ...Object.values(RECIPIENT_CATEGORY_SLUGS),
      ...Object.values(OCCASION_CATEGORY_SLUGS),
    ];

    for (const mapping of mappings) {
      expect(mapping.length).toBeGreaterThan(0);
      expect(new Set(mapping).size).toBe(mapping.length);
    }
  });
});

describe("gift finder query parsing", () => {
  it("defaults to the first page with no filters", () => {
    expect(parseGiftFinderSearchParams(new URLSearchParams())).toEqual({
      ok: true,
      query: {
        ...ANY_SELECTION,
        offset: 0,
        limit: GIFT_FINDER_PAGE_SIZE,
      },
    });
  });

  it("parses supported filters and pagination", () => {
    expect(
      parseGiftFinderSearchParams(
        new URLSearchParams({
          recipient: "kids",
          occasion: "ramdan-night",
          budget: "under-250",
          offset: "8",
          limit: "8",
        }),
      ),
    ).toEqual({
      ok: true,
      query: {
        recipient: "kids",
        occasionSlug: "ramdan-night",
        budget: "under-250",
        offset: 8,
        limit: 8,
      },
    });
  });

  it("rejects unknown filter ids", () => {
    expect(
      parseGiftFinderSearchParams(
        new URLSearchParams({ recipient: "pets" }),
      ),
    ).toEqual({ ok: false });
    expect(
      parseGiftFinderSearchParams(new URLSearchParams({ budget: "free" })),
    ).toEqual({ ok: false });
  });

  it("rejects malformed occasion slugs and pagination", () => {
    expect(
      parseGiftFinderSearchParams(
        new URLSearchParams({ occasion: "Birthday Party" }),
      ),
    ).toEqual({ ok: false });
    expect(
      parseGiftFinderSearchParams(new URLSearchParams({ offset: "-8" })),
    ).toEqual({ ok: false });
    expect(
      parseGiftFinderSearchParams(new URLSearchParams({ limit: "0" })),
    ).toEqual({ ok: false });
    expect(
      parseGiftFinderSearchParams(new URLSearchParams({ limit: "1.5" })),
    ).toEqual({ ok: false });
  });

  it("caps oversized page requests", () => {
    const parsed = parseGiftFinderSearchParams(
      new URLSearchParams({ limit: "1000" }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      query: { limit: GIFT_FINDER_MAX_PAGE_SIZE },
    });
  });
});

describe("gift finder page helpers", () => {
  it("builds an empty page with the requested window", () => {
    expect(emptyGiftFinderPage({ offset: 8, limit: 8 }, true)).toEqual({
      products: [],
      total: 0,
      offset: 8,
      limit: 8,
      hasMore: false,
      occasionUnsupported: true,
    });
  });

  it("omits catalogue rows without a public vendor", () => {
    const product = {
      id: "product-1",
      name: "Test gift",
      slug: "test-gift",
      priceMinor: 30_000,
      stock: 4,
      imagePath: null,
      imageAlt: null,
      vendorId: "vendor-1",
      vendorName: null,
      vendorSlug: "test-shop",
      vendorIsAcceptingOrders: true,
      categoryName: "Flowers",
      categorySlug: "flowers",
    } satisfies CatalogProduct;

    expect(toGiftFinderProduct(product)).toBeNull();
  });
});
