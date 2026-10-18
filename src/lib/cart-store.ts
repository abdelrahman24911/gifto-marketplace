import {
  CART_STORAGE_KEY,
  readStoredCart,
  writeStoredCart,
  type CartItem,
} from "@/lib/cart";

/**
 * A tiny external store over the localStorage cart.
 *
 * `useSyncExternalStore` requires `getSnapshot` to return a cached value —
 * returning a fresh array every call makes React re-render forever — so the
 * parsed cart is cached here and only re-read when storage actually changes
 * (this tab or another one).
 */

let cache: CartItem[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: CartItem[] = [];

function getCache(): CartItem[] {
  if (cache === null) cache = readStoredCart();
  return cache;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): CartItem[] {
  return getCache();
}

/** Stable reference so server rendering does not warn about new objects. */
export function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

export function setCart(items: CartItem[]): void {
  cache = items;
  writeStoredCart(items);
  emit();
}

export function mutateCart(
  update: (items: CartItem[]) => CartItem[],
): void {
  setCart(update(getCache()));
}

function handleStorage(event: StorageEvent): void {
  // `key` is null when another tab calls clear(); treat that as a change too.
  if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
  cache = readStoredCart();
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", handleStorage);
}
