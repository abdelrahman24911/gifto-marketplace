import type { CartItem } from "@/lib/cart";

/** The cart line shape without the quantity chosen by the customer. */
export type QuickAddItem = Omit<CartItem, "quantity">;

type QuickAddSource = {
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
 * Builds the display-only cart line for a quick add. The cart still stores only
 * product ids and quantities; checkout re-reads price, stock, and vendor status
 * from the database.
 */
export function toQuickAddItem(product: QuickAddSource): QuickAddItem | null {
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
