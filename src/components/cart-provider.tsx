"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  addToCart,
  cartCount,
  cartSubtotalMinor,
  removeFromCart,
  setQuantity,
  type CartItem,
} from "@/lib/cart";
import {
  getServerSnapshot,
  getSnapshot,
  mutateCart,
  setCart,
  subscribe,
} from "@/lib/cart-store";

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotalMinor: number;
  /** False until the stored cart has been read, to avoid flashing an empty cart. */
  ready: boolean;
  add: (item: CartItem) => void;
  addMany: (items: CartItem[]) => void;
  update: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Holds the whole cart in one place. localStorage is the source of truth so the
 * cart survives reloads and stays in step across tabs; nothing stored here is
 * trusted — `place_order_with_price_check` prices and validates the order in the database.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Hydration flag: false while the server HTML renders, true once the client
  // has taken over — avoids flashing an "empty cart" before storage is read.
  const ready = useSyncExternalStore(noopSubscribe, alwaysTrue, alwaysFalse);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      ready,
      count: cartCount(items),
      subtotalMinor: cartSubtotalMinor(items),
      add: (item) => mutateCart((current) => addToCart(current, item)),
      addMany: (items) =>
        mutateCart((current) =>
          items.reduce((acc, item) => addToCart(acc, item), current),
        ),
      update: (productId, quantity) =>
        mutateCart((current) => setQuantity(current, productId, quantity)),
      remove: (productId) =>
        mutateCart((current) => removeFromCart(current, productId)),
      clear: () => setCart([]),
    }),
    [items, ready],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}

export function noopSubscribe(): () => void {
  return () => {};
}

export function alwaysTrue(): boolean {
  return true;
}

export function alwaysFalse(): boolean {
  return false;
}
