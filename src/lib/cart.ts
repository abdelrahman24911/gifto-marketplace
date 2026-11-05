/**
 * Client-side cart for the Gifto marketplace.
 *
 * The cart lives in the browser (localStorage) and is never trusted: prices,
 * stock and commission are all read from the database by `place_order` at
 * checkout time. Anything stored here is display state only — the database
 * decides what an order actually costs.
 *
 * Items are keyed by product id, so the same product can never appear twice.
 */

export type CartItem = {
  productId: string;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  name: string;
  slug: string;
  priceMinor: number;
  /** First catalog image path, or null for the monogram fallback. */
  imagePath: string | null;
  quantity: number;
  /** Stock level seen when the item was added; the database re-checks it. */
  stock: number;
};

export const CART_STORAGE_KEY = "gifto.cart.v1";

/** Mirrors the `order_items.quantity` check constraint in the database. */
export const MAX_LINE_QUANTITY = 20;

/** Upper bound on distinct products per order, mirroring `place_order`. */
export const MAX_CART_LINES = 50;

function clampQuantity(quantity: number, stock: number): number {
  const ceiling = Math.min(MAX_LINE_QUANTITY, Math.max(stock, 0));
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.min(Math.floor(quantity), ceiling || 1);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStoredQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_LINE_QUANTITY
  );
}

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    isNonEmptyString(item.productId) &&
    isNonEmptyString(item.vendorId) &&
    isNonEmptyString(item.vendorName) &&
    isNonEmptyString(item.vendorSlug) &&
    isNonEmptyString(item.name) &&
    isNonEmptyString(item.slug) &&
    (item.imagePath === null || typeof item.imagePath === "string") &&
    isNonNegativeSafeInteger(item.priceMinor) &&
    isStoredQuantity(item.quantity) &&
    isNonNegativeSafeInteger(item.stock)
  );
}

/** Adds a product, merging into an existing line instead of duplicating it. */
export function addToCart(items: CartItem[], item: CartItem): CartItem[] {
  const existing = items.find((i) => i.productId === item.productId);

  if (existing) {
    return items.map((i) =>
      i.productId === item.productId
        ? {
            ...i,
            // Refresh the display fields; the database is still authoritative.
            ...item,
            quantity: clampQuantity(i.quantity + item.quantity, item.stock),
          }
        : i,
    );
  }

  if (items.length >= MAX_CART_LINES) return items;

  return [...items, { ...item, quantity: clampQuantity(item.quantity, item.stock) }];
}

export function setQuantity(
  items: CartItem[],
  productId: string,
  quantity: number,
): CartItem[] {
  return items.map((i) =>
    i.productId === productId
      ? { ...i, quantity: clampQuantity(quantity, i.stock) }
      : i,
  );
}

export function removeFromCart(
  items: CartItem[],
  productId: string,
): CartItem[] {
  return items.filter((i) => i.productId !== productId);
}

export function cartSubtotalMinor(items: CartItem[]): number {
  return items.reduce((total, i) => total + i.priceMinor * i.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((count, i) => count + i.quantity, 0);
}

/** The payload `place_order` expects: product ids and quantities, nothing else. */
export function toOrderItems(
  items: CartItem[],
): { product_id: string; quantity: number }[] {
  return items.map((i) => ({ product_id: i.productId, quantity: i.quantity }));
}

export function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const items: CartItem[] = [];
    const seenProductIds = new Set<string>();
    for (const value of parsed) {
      if (!isCartItem(value) || seenProductIds.has(value.productId)) continue;
      seenProductIds.add(value.productId);
      items.push(value);
      if (items.length >= MAX_CART_LINES) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function writeStoredCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage can be unavailable (private mode, quota). The cart then simply
    // does not persist across reloads — checkout still works in this tab.
  }
}
