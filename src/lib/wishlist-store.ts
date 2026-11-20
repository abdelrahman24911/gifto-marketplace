import {
  WISHLIST_STORAGE_KEY,
  readStoredWishlist,
  writeStoredWishlist,
  type WishlistItem,
} from "@/lib/wishlist";

/**
 * A tiny external store over the localStorage wishlist, mirroring
 * `src/lib/cart-store.ts`: `useSyncExternalStore` requires `getSnapshot`
 * to return a cached value, so the parsed wishlist is cached here and
 * only re-read when storage actually changes (this tab or another one).
 */

let cache: WishlistItem[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: WishlistItem[] = [];

function getCache(): WishlistItem[] {
  if (cache === null) cache = readStoredWishlist();
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

export function getSnapshot(): WishlistItem[] {
  return getCache();
}

/** Stable reference so server rendering does not warn about new objects. */
export function getServerSnapshot(): WishlistItem[] {
  return EMPTY;
}

export function setWishlist(items: WishlistItem[]): void {
  cache = items;
  writeStoredWishlist(items);
  emit();
}

export function mutateWishlist(
  update: (items: WishlistItem[]) => WishlistItem[],
): void {
  setWishlist(update(getCache()));
}

function handleStorage(event: StorageEvent): void {
  // `key` is null when another tab calls clear(); treat that as a change too.
  if (event.key !== null && event.key !== WISHLIST_STORAGE_KEY) return;
  cache = readStoredWishlist();
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", handleStorage);
}
