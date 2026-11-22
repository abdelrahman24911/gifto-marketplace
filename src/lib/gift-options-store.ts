import {
  EMPTY_GIFT_OPTIONS,
  GIFT_OPTIONS_STORAGE_KEY,
  readGiftOptions,
  writeGiftOptions,
  type GiftOptions,
} from "@/lib/gift-options";

/**
 * A tiny external store over the localStorage gift draft, mirroring
 * `src/lib/cart-store.ts`: `useSyncExternalStore` requires `getSnapshot`
 * to return a cached value, so the parsed draft is cached here and only
 * re-read when storage actually changes (this tab or another one). The
 * cart page and the checkout form share this draft, and the server
 * snapshot is always empty so hydration never mismatches.
 */

let cache: GiftOptions | null = null;
const listeners = new Set<() => void>();

function getCache(): GiftOptions {
  if (cache === null) cache = readGiftOptions();
  return cache;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeGiftOptions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGiftOptionsSnapshot(): GiftOptions {
  return getCache();
}

/** Stable reference so server rendering does not warn about new objects. */
export function getGiftOptionsServerSnapshot(): GiftOptions {
  return EMPTY_GIFT_OPTIONS;
}

export function setGiftOptions(options: Partial<GiftOptions>): void {
  // Partial updates: the cart's wrap toggle must not wipe a delivery
  // date the customer already picked at checkout (R-08), and vice
  // versa. Callers pass only the fields they change.
  cache = { ...getCache(), ...options };
  writeGiftOptions(cache);
  emit();
}

function handleStorage(event: StorageEvent): void {
  // `key` is null when another tab calls clear(); treat that as a change too.
  if (event.key !== null && event.key !== GIFT_OPTIONS_STORAGE_KEY) return;
  cache = readGiftOptions();
  emit();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", handleStorage);
}
