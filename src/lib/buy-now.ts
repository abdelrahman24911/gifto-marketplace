import { MAX_LINE_QUANTITY, type CartItem } from "@/lib/cart";

/**
 * Buy Now intent helpers.
 *
 * A buy-now checkout is expressed entirely in the URL as a product id and a
 * quantity. Nothing here is trusted: the checkout page validates the product
 * against the database, and `place_order_with_price_check` revalidates everything again.
 */

export const BUY_NOW_PRODUCT_PARAM = "buyNow";
export const BUY_NOW_QUANTITY_PARAM = "quantity";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BuyNowProductRequest = {
  productId: string;
  quantity: number;
};

/** The item plus the page to return to when checkout cannot proceed. */
export type BuyNowCheckout = {
  item: CartItem;
  backHref: string;
};

export function parseBuyNowProductId(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !UUID_PATTERN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Parses the quantity from a buy-now URL. A missing quantity defaults to one;
 * anything that is not a whole number within the cart/database line limit is
 * rejected rather than silently rounded.
 */
export function parseBuyNowQuantity(
  value: string | null | undefined,
): number | null {
  const trimmed = value?.trim();
  const candidate = trimmed === undefined || trimmed === "" ? "1" : trimmed;

  if (!/^\d+$/.test(candidate)) return null;

  const quantity = Number(candidate);
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_LINE_QUANTITY
  ) {
    return null;
  }

  return quantity;
}

export function parseBuyNowProductRequest(
  productId: string | null | undefined,
  quantity: string | null | undefined,
): BuyNowProductRequest | null {
  const parsedProductId = parseBuyNowProductId(productId);
  const parsedQuantity = parseBuyNowQuantity(quantity);

  if (!parsedProductId || parsedQuantity === null) return null;

  return { productId: parsedProductId, quantity: parsedQuantity };
}

export type BuyNowAvailability =
  | { ok: true }
  | {
      ok: false;
      reason: "paused" | "sold-out" | "insufficient-stock";
      available: number;
    };

/**
 * Server-side availability gate used by the checkout page before rendering the
 * buy-now form. The database still re-checks all of this inside the order
 * transaction; this only produces an honest early error for the customer.
 */
export function checkBuyNowAvailability(
  quantity: number,
  stock: number,
  isAcceptingOrders: boolean,
): BuyNowAvailability {
  if (!isAcceptingOrders) {
    return { ok: false, reason: "paused", available: Math.max(0, stock) };
  }

  if (!Number.isFinite(stock) || stock <= 0) {
    return { ok: false, reason: "sold-out", available: 0 };
  }

  if (quantity > stock) {
    return {
      ok: false,
      reason: "insufficient-stock",
      available: Math.floor(stock),
    };
  }

  return { ok: true };
}

/** Highest quantity that can be bought at once for the given stock. */
export function maxPurchasableQuantity(stock: number): number {
  if (!Number.isFinite(stock) || stock <= 0) return 0;
  return Math.min(Math.floor(stock), MAX_LINE_QUANTITY);
}

/** Keeps the quantity control inside 1..max, including keyboard-entered values. */
export function clampPurchaseQuantity(quantity: number, stock: number): number {
  const maximum = maxPurchasableQuantity(stock);
  if (maximum < 1 || !Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(1, Math.floor(quantity)), maximum);
}

export function buildBuyNowHref(productId: string, quantity: number): string {
  const params = new URLSearchParams();
  params.set(BUY_NOW_PRODUCT_PARAM, productId);
  params.set(
    BUY_NOW_QUANTITY_PARAM,
    String(clampPurchaseQuantity(quantity, MAX_LINE_QUANTITY)),
  );
  return `/checkout?${params.toString()}`;
}

/**
 * Buy Now must never include unrelated cart items. The cart itself is left
 * untouched; this only chooses which lines the checkout form submits.
 */
export function selectCheckoutItems(
  cartItems: CartItem[],
  buyNowItem: CartItem | null,
): CartItem[] {
  return buyNowItem ? [buyNowItem] : cartItems;
}

/** A successful buy-now order must not clear the customer's existing cart. */
export function shouldClearCartAfterOrder(isBuyNow: boolean): boolean {
  return !isBuyNow;
}
