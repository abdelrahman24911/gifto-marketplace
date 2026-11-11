import { describe, expect, it } from "vitest";

import {
  PRODUCT_PICKER_MAX_SELECTION,
  PRODUCT_PICKER_PAGE_SIZE,
  addProductToSelection,
  isProductPubliclyAvailable,
  isProductSelected,
  isProductSelectionDirty,
  moveProductInSelection,
  normalizeProductPickerSearch,
  parseProductPickerQuery,
  productAvailabilityNote,
  productPickerRowToItem,
  productPickerSortOrders,
  productSelectionIds,
  removeProductFromSelection,
  type ProductPickerItem,
} from "./occasion-products";
import { pageWindow } from "./pagination";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

function product(
  id = PRODUCT_ID,
  overrides: Partial<ProductPickerItem> = {},
): ProductPickerItem {
  return {
    id,
    name: "Rose box",
    slug: "rose-box",
    priceMinor: 17_500,
    stock: 4,
    status: "active",
    createdAt: "2026-11-01T10:00:00.000Z",
    vendorName: "Bloom Shop",
    vendorSlug: "bloom-shop",
    vendorStatus: "active",
    vendorAcceptingOrders: true,
    categoryId: CATEGORY_ID,
    categoryName: "Flowers",
    categorySlug: "flowers",
    imagePath: "vendor/product/hero.png",
    imageAlt: "Roses in a box",
    ...overrides,
  };
}

describe("parseProductPickerQuery", () => {
  it("normalizes empty input to the default browse state", () => {
    expect(
      parseProductPickerQuery({
        productQuery: "  ",
        vendorQuery: undefined,
        categoryId: "",
        status: "unknown",
        sort: "unknown",
        page: "0",
      }),
    ).toEqual({
      productQuery: "",
      vendorQuery: "",
      categoryId: null,
      status: "all",
      sort: "newest",
      page: 1,
    });
  });

  it("accepts valid filters, a UUID category and a page", () => {
    expect(
      parseProductPickerQuery({
        productQuery: "  rose   box ",
        vendorQuery: " bloom ",
        categoryId: CATEGORY_ID,
        status: "draft",
        sort: "price-desc",
        page: "3",
      }),
    ).toEqual({
      productQuery: "rose box",
      vendorQuery: "bloom",
      categoryId: CATEGORY_ID,
      status: "draft",
      sort: "price-desc",
      page: 3,
    });
  });

  it("rejects an invalid category id instead of sending it to PostgREST", () => {
    expect(
      parseProductPickerQuery({ categoryId: "not-a-uuid" }).categoryId,
    ).toBeNull();
  });

  it("keeps wildcard characters literal and caps search length", () => {
    expect(normalizeProductPickerSearch("  rose%_\\box ")).toBe("rosebox");
    expect(
      normalizeProductPickerSearch("a".repeat(200)),
    ).toHaveLength(80);
  });
});

describe("productPickerSortOrders", () => {
  it("always ends with a unique id tie-breaker", () => {
    for (const sort of [
      "newest",
      "oldest",
      "name",
      "price-asc",
      "price-desc",
    ] as const) {
      const orders = productPickerSortOrders(sort);
      expect(orders.at(-1)).toEqual({
        column: "id",
        ascending: orders[0]?.ascending,
      });
    }
  });
});

describe("productPickerRowToItem", () => {
  it("maps the embedded vendor, category and first image", () => {
    expect(
      productPickerRowToItem({
        id: PRODUCT_ID,
        name: "Rose box",
        slug: "rose-box",
        price_minor: 17_500,
        stock: 4,
        status: "active",
        created_at: "2026-11-01T10:00:00.000Z",
        vendor_id: "55555555-5555-4555-8555-555555555555",
        vendor: {
          name: "Bloom Shop",
          slug: "bloom-shop",
          status: "active",
          is_accepting_orders: true,
        },
        category: { id: CATEGORY_ID, name: "Flowers", slug: "flowers" },
        product_images: [
          { path: "second.png", alt: "Second", position: 2 },
          { path: "first.png", alt: "First", position: 1 },
        ],
      }),
    ).toMatchObject({
      id: PRODUCT_ID,
      priceMinor: 17_500,
      vendorName: "Bloom Shop",
      categoryName: "Flowers",
      imagePath: "first.png",
      imageAlt: "First",
    });
  });

  it("drops a row whose vendor join is missing", () => {
    expect(
      productPickerRowToItem({
        id: PRODUCT_ID,
        name: "Rose box",
        slug: "rose-box",
        price_minor: 17_500,
        stock: 4,
        status: "active",
        created_at: "2026-11-01T10:00:00.000Z",
        vendor_id: "55555555-5555-4555-8555-555555555555",
        vendor: null,
        category: null,
        product_images: null,
      }),
    ).toBeNull();
  });
});

describe("selection helpers", () => {
  it("adds products once and preserves insertion order", () => {
    const first = addProductToSelection([], product());
    const duplicate = addProductToSelection(first.selection, product());
    const second = addProductToSelection(duplicate.selection, product(OTHER_ID));

    expect(second.selection.map((item) => item.id)).toEqual([
      PRODUCT_ID,
      OTHER_ID,
    ]);
    expect(isProductSelected(second.selection, PRODUCT_ID)).toBe(true);
  });

  it("rejects a selection over the database-backed limit", () => {
    const selection = Array.from(
      { length: PRODUCT_PICKER_MAX_SELECTION },
      (_, index) => product(`${index}`),
    );
    const result = addProductToSelection(selection, product(OTHER_ID));

    expect(result.ok).toBe(false);
    expect(result.selection).toHaveLength(PRODUCT_PICKER_MAX_SELECTION);
    expect(result).toMatchObject({
      error: "You can select at most 500 products.",
    });
  });

  it("removes a product without disturbing the rest", () => {
    expect(
      productSelectionIds(
        removeProductFromSelection(
          [product(PRODUCT_ID), product(OTHER_ID), product(THIRD_ID)],
          OTHER_ID,
        ),
      ),
    ).toEqual([PRODUCT_ID, THIRD_ID]);
  });

  it("moves products up and down but never past the ends", () => {
    const selection = [
      product(PRODUCT_ID),
      product(OTHER_ID),
      product(THIRD_ID),
    ];

    expect(
      productSelectionIds(moveProductInSelection(selection, OTHER_ID, "up")),
    ).toEqual([OTHER_ID, PRODUCT_ID, THIRD_ID]);
    expect(
      productSelectionIds(moveProductInSelection(selection, OTHER_ID, "down")),
    ).toEqual([PRODUCT_ID, THIRD_ID, OTHER_ID]);
    expect(
      productSelectionIds(moveProductInSelection(selection, PRODUCT_ID, "up")),
    ).toEqual([PRODUCT_ID, OTHER_ID, THIRD_ID]);
    expect(
      productSelectionIds(
        moveProductInSelection(selection, THIRD_ID, "down"),
      ),
    ).toEqual([PRODUCT_ID, OTHER_ID, THIRD_ID]);
  });

  it("treats a different order as dirty but the same ids in order as clean", () => {
    expect(
      isProductSelectionDirty(
        [product(OTHER_ID), product(PRODUCT_ID)],
        [product(PRODUCT_ID), product(OTHER_ID)],
      ),
    ).toBe(true);
    expect(
      isProductSelectionDirty(
        [product(PRODUCT_ID), product(OTHER_ID)],
        [product(PRODUCT_ID), product(OTHER_ID)],
      ),
    ).toBe(false);
  });
});

describe("availability", () => {
  it("marks only active products from active, accepting shops as public", () => {
    expect(isProductPubliclyAvailable(product())).toBe(true);
    expect(
      isProductPubliclyAvailable(product(PRODUCT_ID, { status: "draft" })),
    ).toBe(false);
    expect(
      isProductPubliclyAvailable(product(PRODUCT_ID, { vendorStatus: "pending" })),
    ).toBe(false);
    expect(
      isProductPubliclyAvailable(
        product(PRODUCT_ID, { vendorAcceptingOrders: false }),
      ),
    ).toBe(false);
  });

  it("explains why a product is not publicly available", () => {
    expect(productAvailabilityNote(product())).toBeNull();
    expect(
      productAvailabilityNote(product(PRODUCT_ID, { status: "draft" })),
    ).toContain("Draft");
    expect(
      productAvailabilityNote(product(PRODUCT_ID, { vendorStatus: "suspended" })),
    ).toContain("suspended");
    expect(
      productAvailabilityNote(
        product(PRODUCT_ID, { vendorAcceptingOrders: false }),
      ),
    ).toBe("Shop paused for orders");
  });
});

describe("page sizing", () => {
  it("uses ten products per page", () => {
    expect(pageWindow(2, PRODUCT_PICKER_PAGE_SIZE)).toEqual({
      page: 2,
      pageSize: 10,
      from: 10,
      to: 19,
    });
  });
});
