"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useCart } from "@/components/cart-provider";
import { ProductImage } from "@/components/product-image";
import { MAX_LINE_QUANTITY, type CartItem } from "@/lib/cart";
import { formatEgp } from "@/lib/money";

function groupByVendor(items: CartItem[]): [string, CartItem[]][] {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    const existing = groups.get(item.vendorId);
    if (existing) existing.push(item);
    else groups.set(item.vendorId, [item]);
  }
  return [...groups.entries()];
}

export function CartView({
  emptyRecommendations,
}: {
  emptyRecommendations?: ReactNode;
}) {
  const { items, subtotalMinor, ready, update, remove, clear } = useCart();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Your cart
        </h1>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="text-sm text-zinc-500 underline hover:text-zinc-800"
          >
            Clear cart
          </button>
        ) : null}
      </div>

      {!ready ? (
        <p className="mt-6 text-sm text-zinc-500">Loading your cart…</p>
      ) : items.length === 0 ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <p className="text-sm text-zinc-600">Your cart is empty.</p>
            <Link
              href="/shops"
              className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Browse shops
            </Link>
          </div>
          {emptyRecommendations ? (
            <div className="mt-8">{emptyRecommendations}</div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-6">
            {groupByVendor(items).map(([vendorId, vendorItems]) => {
              const vendor = vendorItems[0];
              const vendorTotal = vendorItems.reduce(
                (sum, i) => sum + i.priceMinor * i.quantity,
                0,
              );

              return (
                <section
                  key={vendorId}
                  className="rounded-2xl border border-zinc-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/shops/${vendor.vendorSlug}`}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                    >
                      {vendor.vendorName}
                    </Link>
                    <span className="text-sm text-zinc-500">
                      Delivery from this shop: free
                    </span>
                  </div>

                  <ul className="mt-3 flex flex-col divide-y divide-zinc-100">
                    {vendorItems.map((item) => (
                      <li
                        key={item.productId}
                        className="flex flex-wrap items-center gap-4 py-3"
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
                          <p className="text-sm text-zinc-500">
                            {formatEgp(item.priceMinor)} each
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <label
                            className="sr-only"
                            htmlFor={`qty-${item.productId}`}
                          >
                            Quantity for {item.name}
                          </label>
                          <input
                            id={`qty-${item.productId}`}
                            type="number"
                            min={1}
                            max={Math.min(MAX_LINE_QUANTITY, item.stock)}
                            value={item.quantity}
                            onChange={(event) =>
                              update(item.productId, Number(event.target.value))
                            }
                            className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                          />
                          <button
                            type="button"
                            onClick={() => remove(item.productId)}
                            className="text-sm text-zinc-500 underline hover:text-zinc-800"
                          >
                            Remove
                          </button>
                        </div>

                        <p className="w-24 text-right font-medium text-zinc-900">
                          {formatEgp(item.priceMinor * item.quantity)}
                        </p>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-2 text-right text-sm text-zinc-600">
                    Shop subtotal:{" "}
                    <span className="font-medium text-zinc-900">
                      {formatEgp(vendorTotal)}
                    </span>
                  </p>
                </section>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between text-sm text-zinc-600">
              <span>Items</span>
              <span className="font-medium text-zinc-900">
                {formatEgp(subtotalMinor)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-zinc-600">
              <span>Delivery</span>
              <span className="font-medium text-zinc-900">Free</span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-4">
              <span className="font-medium text-zinc-900">Total</span>
              <span className="text-lg font-semibold text-zinc-900">
                {formatEgp(subtotalMinor)}
              </span>
            </div>

            <Link
              href="/checkout"
              className="mt-5 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Proceed to checkout
            </Link>
            <p className="mt-3 text-xs text-zinc-500">
              Cash on delivery. Prices are confirmed by the shop at checkout.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
