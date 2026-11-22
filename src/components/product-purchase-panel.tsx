"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useCart } from "@/components/cart-provider";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { WishlistButton } from "@/components/wishlist-button";
import { Link } from "@/i18n/navigation";
import {
  buildBuyNowHref,
  clampPurchaseQuantity,
  maxPurchasableQuantity,
} from "@/lib/buy-now";
import type { CartItem } from "@/lib/cart";
import { formatEgp, type MoneyLocale } from "@/lib/money";

type PurchaseItem = Omit<CartItem, "quantity">;

export function ProductPurchasePanel({
  item,
  acceptingOrders,
}: {
  item: PurchaseItem;
  acceptingOrders: boolean;
}) {
  const t = useTranslations("product");
  const tc = useTranslations("common");
  const locale = useLocale() as MoneyLocale;
  const { add, items } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [addedQuantity, setAddedQuantity] = useState<number | null>(null);

  const maxQuantity = maxPurchasableQuantity(item.stock);
  const soldOut = maxQuantity === 0;
  const purchasable = acceptingOrders && !soldOut;
  const inCart = items.find((line) => line.productId === item.productId);
  const atCartLimit = (inCart?.quantity ?? 0) >= maxQuantity;

  const buyNowHref = buildBuyNowHref(item.productId, quantity);

  function changeQuantity(next: number): void {
    setQuantity(clampPurchaseQuantity(next, item.stock));
    setAddedQuantity(null);
  }

  function addToCart(): void {
    add({ ...item, quantity });
    setAddedQuantity(quantity);
  }

  if (!purchasable) {
    return (
      <div className="rounded-2xl border border-line bg-paper-deep/65 p-4">
        <p className="text-sm font-medium text-ink">
          {soldOut
            ? t("soldOutMessage")
            : t("pausedMessage", { shop: item.vendorName })}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {soldOut ? t("soldOutBody") : t("pausedBody")}
        </p>
        <Link
          href={`/shops/${item.vendorSlug}`}
          className="mt-3 inline-block text-sm font-medium text-berry hover:text-berry-deep"
        >
          {t("visitShopName", { shop: item.vendorName })}
        </Link>
      </div>
    );
  }

  const status =
    addedQuantity !== null
      ? t("addedToCart", { count: addedQuantity })
      : inCart
        ? atCartLimit
          ? t("maxInCart", { max: maxQuantity })
          : t("inYourCart", { count: inCart.quantity })
        : "";

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label
            htmlFor={`quantity-${item.productId}`}
            className="text-sm font-medium text-ink"
          >
            {t("quantity")}
          </label>

          <div className="inline-flex items-center rounded-full border border-line bg-paper p-1">
            <button
              type="button"
              onClick={() => changeQuantity(quantity - 1)}
              disabled={quantity <= 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
              aria-label={t("decreaseQuantity")}
            >
              <MinusIcon className="h-4 w-4" />
            </button>

            <input
              id={`quantity-${item.productId}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(event) => {
                const next = event.target.valueAsNumber;
                if (Number.isFinite(next)) changeQuantity(next);
              }}
              onBlur={() => changeQuantity(quantity)}
              className="w-12 border-0 bg-transparent text-center text-sm font-semibold text-ink [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />

            <button
              type="button"
              onClick={() => changeQuantity(quantity + 1)}
              disabled={quantity >= maxQuantity}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
              aria-label={t("increaseQuantity")}
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>

          <span className="text-xs text-ink-mute">
            {t("upTo", { count: maxQuantity })}
          </span>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={addToCart}
            disabled={atCartLimit}
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-berry/25 bg-paper px-5 py-3 text-sm font-semibold text-berry-deep transition-colors hover:border-berry/45 hover:bg-berry-soft disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
          >
            {t("addToCart")}
          </button>

          <Link
            href={buyNowHref}
            prefetch={false}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-berry px-5 py-3 text-sm font-semibold text-paper shadow-[0_14px_30px_-18px_oklch(0.33_0.13_12/0.8)] transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
          >
            {t("buyNow")}
          </Link>
        </div>

        <WishlistButton item={item} variant="full" />

        <p
          aria-live="polite"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft"
        >
          {status}
          {status ? (
            <Link
              href="/cart"
              className="font-medium text-berry hover:text-berry-deep"
            >
              {tc("viewCart")}
            </Link>
          ) : null}
        </p>

        <p className="text-xs leading-relaxed text-ink-mute">
          {t("buyNowNote")}
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_45px_-35px_oklch(0.28_0.03_40/0.6)] backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink-mute">
              {quantity} × {item.name}
            </p>
            <p className="font-display text-lg leading-tight text-ink">
              {formatEgp(item.priceMinor * quantity, locale)}
            </p>
          </div>
          <Link
            href={buyNowHref}
            prefetch={false}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
          >
            {t("buyNow")}
          </Link>
        </div>
      </div>
    </>
  );
}
