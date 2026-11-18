"use client";

import { useCart } from "@/components/cart-provider";
import { CartIcon } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";

/** Header cart link. Renders a stable label until the stored cart is read. */
export function CartLink({ className }: { className?: string }) {
  const { count, ready } = useCart();

  return (
    <GuardedLink
      href="/cart"
      className={className}
      aria-label={
        ready && count > 0
          ? `Cart, ${count} ${count === 1 ? "item" : "items"}`
          : "Cart"
      }
    >
      <CartIcon className="h-5 w-5" />
      <span className="hidden sm:inline">Cart</span>
      {ready && count > 0 ? (
        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-berry px-1.5 text-xs font-semibold text-paper">
          {count}
        </span>
      ) : null}
    </GuardedLink>
  );
}
