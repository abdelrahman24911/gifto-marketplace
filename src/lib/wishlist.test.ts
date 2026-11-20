import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_WISHLIST_ITEMS,
  WISHLIST_STORAGE_KEY,
  addToWishlist,
  isWishlisted,
  readStoredWishlist,
  removeFromWishlist,
  toWishlistItem,
  toggleWishlist,
  writeStoredWishlist,
  type WishlistItem,
} from "@/lib/wishlist";

function item(overrides: Partial<WishlistItem> = {}): WishlistItem {
  return {
    productId: "p1",
    vendorId: "v1",
    vendorName: "Shop",
    vendorSlug: "shop",
    name: "Gift",
    slug: "gift",
    priceMinor: 15000,
    imagePath: null,
    stock: 10,
    ...overrides,
  };
}

describe("wishlist list operations", () => {
  it("toggles: adds when absent, removes when present", () => {
    const added = toggleWishlist([], item());
    expect(added).toHaveLength(1);
    expect(toggleWishlist(added, item())).toEqual([]);
  });

  it("add is idempotent and respects the cap", () => {
    const one = addToWishlist([], item());
    expect(addToWishlist(one, item())).toEqual(one);
    const full = Array.from({ length: MAX_WISHLIST_ITEMS }, (_, i) =>
      item({ productId: `p${i}` }),
    );
    expect(addToWishlist(full, item({ productId: "px" }))).toEqual(full);
    expect(toggleWishlist(full, item({ productId: "px" }))).toEqual(full);
  });

  it("isWishlisted and remove work by product id", () => {
    const items = [item(), item({ productId: "p2" })];
    expect(isWishlisted(items, "p2")).toBe(true);
    expect(isWishlisted(items, "p3")).toBe(false);
    expect(removeFromWishlist(items, "p1")).toEqual([item({ productId: "p2" })]);
  });
});

describe("toWishlistItem", () => {
  it("builds a wishlist item from a catalogue product", () => {
    expect(
      toWishlistItem({
        id: "p1",
        name: "Gift",
        slug: "gift",
        priceMinor: 15000,
        stock: 3,
        imagePath: "products/a.jpg",
        vendorId: "v1",
        vendorName: "Shop",
        vendorSlug: "shop",
      }),
    ).toEqual(item({ imagePath: "products/a.jpg", stock: 3 }));
  });

  it("returns null when the shop name is missing", () => {
    expect(
      toWishlistItem({
        id: "p1",
        name: "Gift",
        slug: "gift",
        priceMinor: 15000,
        stock: 3,
        imagePath: null,
        vendorId: "v1",
        vendorName: null,
        vendorSlug: "shop",
      }),
    ).toBeNull();
  });
});

describe("readStoredWishlist validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function withStored(raw: string): string[] {
    const written: string[] = [];
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => (key === WISHLIST_STORAGE_KEY ? raw : null),
        setItem: (_key: string, value: string) => {
          written.push(value);
        },
      },
    });
    return written;
  }

  it("keeps valid items, drops malformed ones and dedupes", () => {
    withStored(
      JSON.stringify([
        item(),
        item({ productId: "p2", priceMinor: 0, stock: 0 }),
        { ...item({ productId: "p1" }), priceMinor: -5 },
        { productId: "p3" },
        item({ productId: "p1" }),
      ]),
    );
    expect(readStoredWishlist()).toEqual([
      item(),
      item({ productId: "p2", priceMinor: 0, stock: 0 }),
    ]);
  });

  it("returns empty for malformed JSON and writes through", () => {
    const written = withStored("{not json");
    expect(readStoredWishlist()).toEqual([]);
    writeStoredWishlist([item()]);
    expect(JSON.parse(written[0])).toEqual([item()]);
  });
});
