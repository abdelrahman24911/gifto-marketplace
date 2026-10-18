"use client";

import Link from "next/link";
import { useState } from "react";

import { useCart } from "@/components/cart-provider";
import { MAX_LINE_QUANTITY, type CartItem } from "@/lib/cart";

/**
 * Adds a product to the browser cart. The cart only ever stores product ids and
 * quantities alongside display fields — `place_order` prices everything from the
 * database, so nothing here can change what an item costs.
 */
export function AddToCartButton({ item }: { item: Omit<CartItem, "quantity"> }) {
  const { add, items } = useCart();
  const [added, setAdded] = useState(false);

  const soldOut = item.stock <= 0;
  const inCart = items.find((i) => i.productId === item.productId);
  const atLimit = (inCart?.quantity ?? 0) >= MAX_LINE_QUANTITY;

  if (soldOut) {
    return (
      <p className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-500">
        Sold out
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          add({ ...item, quantity: 1 });
          setAdded(true);
        }}
        className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
      >
        Add to cart
      </button>
      {added ? (
        <Link
          href="/cart"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          View cart
        </Link>
      ) : null}
      <span aria-live="polite" className="text-sm text-zinc-500">
        {inCart
          ? atLimit
            ? `${MAX_LINE_QUANTITY} in cart (max per item)`
            : `${inCart.quantity} in cart`
          : ""}
      </span>
    </div>
  );
}
