import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addToCart,
  cartCount,
  cartSubtotalMinor,
  CART_STORAGE_KEY,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
  readStoredCart,
  removeFromCart,
  setQuantity,
  toOrderItems,
  type CartItem,
} from "./cart";

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: "p1",
    vendorId: "v1",
    vendorName: "Shop",
    vendorSlug: "shop",
    name: "Gift",
    slug: "gift",
    priceMinor: 15000,
    imagePath: null,
    quantity: 1,
    stock: 10,
    ...overrides,
  };
}

function withStoredCart(raw: string): void {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => (key === CART_STORAGE_KEY ? raw : null),
      setItem: () => {},
    },
    addEventListener: () => {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readStoredCart validation", () => {
  it("keeps valid items without changing quantities or prices", () => {
    const valid = [
      item({
        priceMinor: 0,
        stock: 0,
        quantity: MAX_LINE_QUANTITY,
        imagePath: "products/a.jpg",
      }),
      item({ productId: "p2", priceMinor: 17550, quantity: 2 }),
    ];

    withStoredCart(JSON.stringify(valid));

    expect(readStoredCart()).toEqual(valid);
  });

  it("drops entries with missing or invalid product and vendor strings", () => {
    const valid = item();
    const malformed = [
      { ...valid, productId: "" },
      { ...valid, vendorId: 42 },
      { ...valid, vendorName: "   " },
      { ...valid, vendorSlug: null },
      { ...valid, name: "" },
      { ...valid, slug: false },
      { ...valid, imagePath: 42 },
    ];

    withStoredCart(JSON.stringify([valid, ...malformed]));

    expect(readStoredCart()).toEqual([valid]);
  });

  it("drops entries with negative, fractional, or out-of-range numbers", () => {
    const valid = item();
    const malformed = [
      item({ productId: "p2", priceMinor: -1 }),
      item({ productId: "p3", priceMinor: 1.5 }),
      item({ productId: "p4", quantity: 0 }),
      item({ productId: "p5", quantity: 1.5 }),
      item({ productId: "p6", quantity: MAX_LINE_QUANTITY + 1 }),
      item({ productId: "p7", stock: -1 }),
      item({ productId: "p8", stock: 1.5 }),
    ];

    withStoredCart(JSON.stringify([valid, ...malformed]));

    expect(readStoredCart()).toEqual([valid]);
  });

  it("drops entries with non-finite numbers", () => {
    const valid = item();
    const raw = `[${JSON.stringify(valid)},${JSON.stringify({
      ...valid,
      productId: "p2",
    }).replace('"priceMinor":15000', '"priceMinor":1e999')}]`;

    withStoredCart(raw);

    expect(readStoredCart()).toEqual([valid]);
  });

  it("returns an empty cart for malformed or non-array storage", () => {
    withStoredCart("not-json");
    expect(readStoredCart()).toEqual([]);

    withStoredCart(JSON.stringify({ items: [] }));
    expect(readStoredCart()).toEqual([]);
  });

  it("deduplicates product ids and caps stored lines", () => {
    const first = item({ productId: "p1", priceMinor: 100 });
    const duplicate = item({ productId: "p1", priceMinor: 999 });
    const extras = Array.from({ length: MAX_CART_LINES + 5 }, (_, index) =>
      item({ productId: `extra-${index}` }),
    );

    withStoredCart(JSON.stringify([first, duplicate, ...extras]));

    const stored = readStoredCart();
    expect(stored).toHaveLength(MAX_CART_LINES);
    expect(stored[0]).toEqual(first);
    expect(stored.filter((i) => i.productId === "p1")).toHaveLength(1);
  });
});

describe("addToCart", () => {
  it("appends a new line", () => {
    expect(addToCart([], item())).toEqual([item()]);
  });

  it("merges into an existing line and refreshes display fields", () => {
    const cart = addToCart([], item({ quantity: 2, name: "Old name" }));
    const merged = addToCart(
      cart,
      item({ quantity: 3, name: "New name", priceMinor: 20000 }),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      quantity: 5,
      name: "New name",
      priceMinor: 20000,
    });
  });

  it("clamps quantity to stock", () => {
    const [line] = addToCart([], item({ quantity: 99, stock: 4 }));
    expect(line.quantity).toBe(4);
  });

  it("clamps quantity to the per-line maximum", () => {
    const [line] = addToCart(
      [],
      item({ quantity: MAX_LINE_QUANTITY + 5, stock: 100 }),
    );
    expect(line.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("never drops a quantity below one", () => {
    const [line] = addToCart([], item({ quantity: 0 }));
    expect(line.quantity).toBe(1);
  });

  it("refuses new lines past the cart cap", () => {
    const full = Array.from({ length: MAX_CART_LINES }, (_, i) =>
      item({ productId: `p${i}` }),
    );
    expect(addToCart(full, item({ productId: "one-too-many" }))).toHaveLength(
      MAX_CART_LINES,
    );
  });
});

describe("setQuantity / removeFromCart", () => {
  it("updates only the matching line, clamped to stock", () => {
    const cart = [item({ productId: "p1" }), item({ productId: "p2" })];
    const next = setQuantity(cart, "p1", 999);
    expect(next[0].quantity).toBe(10);
    expect(next[1].quantity).toBe(1);
  });

  it("removes the matching line", () => {
    const cart = [item({ productId: "p1" }), item({ productId: "p2" })];
    expect(removeFromCart(cart, "p1")).toEqual([item({ productId: "p2" })]);
  });
});

describe("totals", () => {
  it("sums line totals as integer piastres", () => {
    const cart = [
      item({ productId: "p1", priceMinor: 15000, quantity: 2 }),
      item({ productId: "p2", priceMinor: 500, quantity: 1 }),
    ];
    expect(cartSubtotalMinor(cart)).toBe(30500);
    expect(cartCount(cart)).toBe(3);
  });

  it("sends only product ids and quantities to place_order_with_price_check", () => {
    const cart = [item({ productId: "p1", quantity: 2 })];
    expect(toOrderItems(cart)).toEqual([{ product_id: "p1", quantity: 2 }]);
  });
});

describe("readStoredCart (server)", () => {
  it("returns an empty cart when there is no window", () => {
    expect(typeof window).toBe("undefined");
    expect(readStoredCart()).toEqual([]);
    expect(CART_STORAGE_KEY).toBe("gifto.cart.v1");
  });
});
