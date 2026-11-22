/**
 * Client-side wishlist for the Gifto marketplace.
 *
 * Same shape as the cart: the browser (localStorage) holds the wishlist so
 * guests can save gifts without an account, and nothing stored here is
 * trusted — prices and stock are re-checked by `place_order_with_price_check` at checkout.
 * Signed-in customers additionally persist to the `wishlists` table
 * (migration 47) through the server actions in
 * `src/app/[locale]/(storefront)/wishlist/actions.ts`; the provider loads
 * that copy on mount so the wishlist follows the account across devices.
 */

export type WishlistItem = {
  productId: string;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  name: string;
  slug: string;
  priceMinor: number;
  /** First catalog image path, or null for the monogram fallback. */
  imagePath: string | null;
  /** Stock level seen when the item was saved; the database re-checks it. */
  stock: number;
};

export const WISHLIST_STORAGE_KEY = "gifto.wishlist.v1";

/** Upper bound on saved gifts, mirroring the cart's line cap shape. */
export const MAX_WISHLIST_ITEMS = 100;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isWishlistItem(value: unknown): value is WishlistItem {
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
    isNonNegativeSafeInteger(item.stock)
  );
}

export function isWishlisted(items: WishlistItem[], productId: string): boolean {
  return items.some((item) => item.productId === productId);
}

type WishlistSource = {
  id: string;
  name: string;
  slug: string;
  priceMinor: number;
  stock: number;
  imagePath: string | null;
  vendorId: string;
  vendorName: string | null;
  vendorSlug: string;
};

/**
 * Builds a wishlist item from a catalogue product, mirroring
 * `toQuickAddItem` in `src/lib/quick-add.ts`. Returns null when the shop
 * name is missing — a wishlist row without a shop cannot be shown.
 */
export function toWishlistItem(product: WishlistSource): WishlistItem | null {
  if (!product.vendorName) return null;

  return {
    productId: product.id,
    vendorId: product.vendorId,
    vendorName: product.vendorName,
    vendorSlug: product.vendorSlug,
    name: product.name,
    slug: product.slug,
    priceMinor: product.priceMinor,
    imagePath: product.imagePath,
    stock: product.stock,
  };
}

/** Adds a gift, or removes it when it is already saved (toggle). */
export function toggleWishlist(
  items: WishlistItem[],
  item: WishlistItem,
): WishlistItem[] {
  if (isWishlisted(items, item.productId)) {
    return items.filter((i) => i.productId !== item.productId);
  }
  if (items.length >= MAX_WISHLIST_ITEMS) return items;
  return [...items, { ...item }];
}

export function addToWishlist(
  items: WishlistItem[],
  item: WishlistItem,
): WishlistItem[] {
  if (isWishlisted(items, item.productId)) return items;
  if (items.length >= MAX_WISHLIST_ITEMS) return items;
  return [...items, { ...item }];
}

export function removeFromWishlist(
  items: WishlistItem[],
  productId: string,
): WishlistItem[] {
  return items.filter((i) => i.productId !== productId);
}

export type WishlistMerge = {
  /** Server items first (fresh prices/stock), then guest-only items. */
  merged: WishlistItem[];
  /** Guest items that are not on the server yet and must be uploaded. */
  toUpload: WishlistItem[];
};

/**
 * Merge a guest's browser-local wishlist into the account copy on
 * sign-in (R-08). The old behaviour replaced the local list with the
 * server list, silently discarding everything the guest had saved
 * before signing in. Server items win on conflict (their prices and
 * stock are live), guest-only items are appended in local order and
 * capped at MAX_WISHLIST_ITEMS like every other wishlist write.
 */
export function mergeWishlists(
  serverItems: WishlistItem[],
  localItems: WishlistItem[],
): WishlistMerge {
  const merged: WishlistItem[] = [...serverItems];
  const toUpload: WishlistItem[] = [];
  for (const local of localItems) {
    if (isWishlisted(merged, local.productId)) continue;
    if (merged.length >= MAX_WISHLIST_ITEMS) break;
    merged.push({ ...local });
    toUpload.push(local);
  }
  return { merged, toUpload };
}

export function readStoredWishlist(): WishlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const items: WishlistItem[] = [];
    const seenProductIds = new Set<string>();
    for (const value of parsed) {
      if (!isWishlistItem(value) || seenProductIds.has(value.productId)) {
        continue;
      }
      seenProductIds.add(value.productId);
      items.push(value);
      if (items.length >= MAX_WISHLIST_ITEMS) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function writeStoredWishlist(items: WishlistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage can be unavailable (private mode, quota). The wishlist then
    // simply does not persist across reloads for guests.
  }
}
