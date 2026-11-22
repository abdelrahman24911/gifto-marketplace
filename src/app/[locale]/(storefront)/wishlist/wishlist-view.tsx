"use client";

import { useLocale, useTranslations } from "next-intl";

import { useCart } from "@/components/cart-provider";
import { ProductImage } from "@/components/product-image";
import { useToast } from "@/components/toast-provider";
import { useWishlist } from "@/components/wishlist-provider";
import { Link } from "@/i18n/navigation";
import { maxPurchasableQuantity } from "@/lib/buy-now";
import { formatEgp, type MoneyLocale } from "@/lib/money";
import type { WishlistItem } from "@/lib/wishlist";

/**
 * The customer's saved gifts. Reads the wishlist provider (browser-local
 * for guests, synced from the account for signed-in customers), so the
 * page works with no round-trip. Adding to cart re-uses the cart's own
 * quantity rules; the database re-checks price and stock at checkout.
 */
export function WishlistView({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("wishlist");
  const tp = useTranslations("product");
  const tc = useTranslations("common");
  const locale = useLocale() as MoneyLocale;
  const { items, ready, remove } = useWishlist();
  const { add, items: cartItems } = useCart();
  const { notify } = useToast();

  function addItemToCart(item: WishlistItem): void {
    add({ ...item, quantity: 1 });
    notify(tp("addedToCart", { count: 1 }), "success");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        {signedIn ? t("syncedNote") : t("guestNote")}
      </p>

      {!ready ? (
        <p className="mt-6 text-sm text-zinc-500">{tc("loading")}</p>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
          <p className="text-sm text-zinc-600">{t("empty")}</p>
          <p className="mt-1 text-sm text-zinc-500">{t("emptyBody")}</p>
          <Link
            href="/shops"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            {tc("browseShops")}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {items.map((item) => {
            const maxQuantity = maxPurchasableQuantity(item.stock);
            const soldOut = maxQuantity === 0;
            const inCart = cartItems.find(
              (line) => line.productId === item.productId,
            );
            const atCartLimit = (inCart?.quantity ?? 0) >= maxQuantity;

            return (
              <li
                key={item.productId}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4"
              >
                <ProductImage
                  path={item.imagePath}
                  alt={item.name}
                  name={item.name}
                  className="h-16 w-16"
                  sizes="64px"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/shops/${item.vendorSlug}/${item.slug}`}
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <p className="truncate text-sm text-zinc-500">
                    {item.vendorName}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-zinc-900">
                    {formatEgp(item.priceMinor, locale)}
                  </p>
                  {soldOut ? (
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {t("soldOut")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addItemToCart(item)}
                    disabled={soldOut || atCartLimit}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tp("addToCart")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      remove(item.productId);
                      notify(t("removed", { name: item.name }), "info");
                    }}
                    className="text-sm text-zinc-500 underline hover:text-zinc-800"
                  >
                    {t("remove")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
