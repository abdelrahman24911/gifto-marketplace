import { beforeEach, describe, expect, it, vi } from "vitest";

import { CART_STORAGE_KEY, type CartItem } from "./cart";
import {
  getServerSnapshot,
  getSnapshot,
  mutateCart,
  setCart,
  subscribe,
} from "./cart-store";

function item(productId: string): CartItem {
  return {
    productId,
    vendorId: "v1",
    vendorName: "Shop",
    vendorSlug: "shop",
    name: "Gift",
    slug: "gift",
    priceMinor: 15000,
    imagePath: null,
    quantity: 1,
    stock: 10,
  };
}

describe("cart-store", () => {
  beforeEach(() => {
    setCart([]);
  });

  it("returns a stable snapshot reference", () => {
    expect(getSnapshot()).toBe(getSnapshot());
  });

  it("notifies subscribers on setCart and mutateCart", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    setCart([item("p1")]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSnapshot()).toEqual([item("p1")]);

    mutateCart((items) => [...items, item("p2")]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSnapshot().map((i) => i.productId)).toEqual(["p1", "p2"]);

    unsubscribe();
    setCart([item("p3")]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps a stable empty snapshot for server rendering", () => {
    expect(getServerSnapshot()).toBe(getServerSnapshot());
    expect(getServerSnapshot()).toEqual([]);
  });

  it("persists through the injected localStorage shim", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
      addEventListener: () => {},
    });

    try {
      setCart([item("p1")]);
      expect(store.get(CART_STORAGE_KEY)).toContain("p1");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
