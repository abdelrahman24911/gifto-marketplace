"use client";

import { useEffect, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { CheckIcon, PlusIcon } from "@/components/icons";
import { maxPurchasableQuantity } from "@/lib/buy-now";
import type { QuickAddItem } from "@/lib/quick-add";

export function QuickAddButton({
  item,
  acceptingOrders,
  className = "",
}: {
  item: QuickAddItem;
  acceptingOrders: boolean;
  className?: string;
}) {
  const { add, items } = useCart();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [added]);

  const maxQuantity = maxPurchasableQuantity(item.stock);
  const soldOut = maxQuantity === 0;
  const inCart = items.find((line) => line.productId === item.productId);
  const atCartLimit = (inCart?.quantity ?? 0) >= maxQuantity;

  if (!acceptingOrders) {
    return (
      <span
        className={`inline-flex h-9 w-full items-center justify-center rounded-full border border-line bg-paper-deep/60 px-3 text-xs font-medium text-ink-mute ${className}`}
        title={`${item.vendorName} has paused new orders.`}
      >
        Shop paused
      </span>
    );
  }

  if (soldOut) {
    return (
      <span
        className={`inline-flex h-9 w-full items-center justify-center rounded-full border border-line bg-paper-deep/60 px-3 text-xs font-medium text-ink-mute ${className}`}
      >
        Sold out
      </span>
    );
  }

  if (atCartLimit) {
    return (
      <span
        className={`inline-flex h-9 w-full items-center justify-center rounded-full border border-line bg-paper-deep/60 px-3 text-xs font-medium text-ink-mute ${className}`}
        title={`The maximum quantity is already in your cart.`}
      >
        Max in cart
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          add({ ...item, quantity: 1 });
          setAdded(true);
        }}
        disabled={added}
        aria-label={
          added
            ? `Added to cart: ${item.name}`
            : `Add to cart: ${item.name}`
        }
        className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-berry/25 bg-paper px-3 text-xs font-semibold text-berry-deep transition-colors hover:border-berry/45 hover:bg-berry-soft disabled:cursor-wait disabled:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry ${className}`}
      >
        {added ? (
          <CheckIcon className="h-3.5 w-3.5" />
        ) : (
          <PlusIcon className="h-3.5 w-3.5" />
        )}
        {added ? "Added" : "Add to cart"}
      </button>
      <span aria-live="polite" className="sr-only">
        {added ? `${item.name} added to your cart.` : ""}
      </span>
    </>
  );
}
