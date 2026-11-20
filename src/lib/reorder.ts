import { MAX_LINE_QUANTITY, type CartItem } from "@/lib/cart";
import type { CatalogProduct } from "@/lib/catalog";
import { toQuickAddItem } from "@/lib/quick-add";

/** One line of a past order, as stored on `order_items`. */
export type ReorderLine = {
  /** Null when the product was removed — such a line can never be reordered. */
  productId: string | null;
  productName: string;
  quantity: number;
};

export type ReorderResolution = {
  /** Lines re-added to the cart, priced at today's live price. */
  items: CartItem[];
  /** Names of lines that could not be reordered at all. */
  skipped: string[];
  /** True when at least one line's quantity was cut to live stock. */
  adjusted: boolean;
};

/**
 * Resolve a past order's lines against live catalog data.
 *
 * A line is reordered only when the product is still listed, its shop is
 * still accepting orders, and it has stock. The quantity is clamped to
 * live stock and the per-line maximum, and the price is always today's
 * price — the historical price is never reused. Duplicate lines for the
 * same product are merged. The database re-checks price and stock at
 * checkout, so this is a convenience, not a price promise.
 */
export function resolveReorderItems(
  lines: ReorderLine[],
  live: CatalogProduct[],
): ReorderResolution {
  const liveById = new Map(live.map((product) => [product.id, product]));

  const merged = new Map<string, { name: string; quantity: number }>();
  const skipped: string[] = [];
  for (const line of lines) {
    if (!line.productId) {
      skipped.push(line.productName);
      continue;
    }
    const existing = merged.get(line.productId);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      merged.set(line.productId, {
        name: line.productName,
        quantity: line.quantity,
      });
    }
  }

  const items: CartItem[] = [];
  let adjusted = false;

  for (const [productId, line] of merged) {
    const product = liveById.get(productId);
    if (!product || !product.vendorIsAcceptingOrders || product.stock <= 0) {
      skipped.push(line.name);
      continue;
    }
    const base = toQuickAddItem(product);
    if (!base) {
      skipped.push(line.name);
      continue;
    }
    const quantity = Math.min(
      line.quantity,
      product.stock,
      MAX_LINE_QUANTITY,
    );
    if (quantity < line.quantity) adjusted = true;
    items.push({ ...base, quantity });
  }

  return { items, skipped, adjusted };
}
