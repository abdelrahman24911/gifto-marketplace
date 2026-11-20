"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useToast } from "@/components/toast-provider";
import {
  addToWishlist,
  isWishlisted,
  removeFromWishlist,
  type WishlistItem,
} from "@/lib/wishlist";
import {
  getServerSnapshot,
  getSnapshot,
  mutateWishlist,
  setWishlist,
  subscribe,
} from "@/lib/wishlist-store";

import {
  addWishlistItem,
  listWishlistItems,
  removeWishlistItem,
} from "@/app/[locale]/(storefront)/wishlist/actions";

type WishlistContextValue = {
  items: WishlistItem[];
  count: number;
  /** False until the stored wishlist has been read, to avoid flashing an empty list. */
  ready: boolean;
  saved: (productId: string) => boolean;
  toggle: (item: WishlistItem) => void;
  remove: (productId: string) => void;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

/**
 * Holds the wishlist in one place, mirroring the cart provider:
 * localStorage is the guest source of truth, and for signed-in customers
 * the database copy (migration 47) is loaded once on mount and every
 * toggle writes through to it. A failed server write rolls the local
 * change back and announces the failure — the button never claims a save
 * that did not happen.
 */
export function WishlistProvider({
  children,
  signedIn,
}: {
  children: ReactNode;
  signedIn: boolean;
}) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(noopSubscribe, alwaysTrue, alwaysFalse);
  const { notify } = useToast();
  const synced = useRef(false);

  useEffect(() => {
    if (!signedIn || synced.current) return;
    synced.current = true;
    let cancelled = false;
    listWishlistItems()
      .then((serverItems) => {
        if (!cancelled) setWishlist(serverItems);
      })
      .catch(() => {
        // The local copy stays usable; the next toggle retries the sync.
        synced.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const toggle = useCallback(
    (item: WishlistItem) => {
      const wasSaved = isWishlisted(items, item.productId);
      mutateWishlist((current) =>
        wasSaved
          ? removeFromWishlist(current, item.productId)
          : addToWishlist(current, item),
      );
      if (!signedIn) return;
      const persist = wasSaved
        ? removeWishlistItem(item.productId)
        : addWishlistItem(item.productId);
      persist.then(({ ok }) => {
        if (ok) return;
        // Roll the optimistic change back so local and server agree.
        mutateWishlist((current) =>
          wasSaved
            ? addToWishlist(current, item)
            : removeFromWishlist(current, item.productId),
        );
        notify("Your wishlist could not be saved. Try again.", "error");
      });
    },
    [items, signedIn, notify],
  );

  const remove = useCallback(
    (productId: string) => {
      const existing = items.find((i) => i.productId === productId);
      if (!existing) return;
      mutateWishlist((current) => removeFromWishlist(current, productId));
      if (!signedIn) return;
      removeWishlistItem(productId).then(({ ok }) => {
        if (ok) return;
        mutateWishlist((current) => addToWishlist(current, existing));
        notify("Your wishlist could not be saved. Try again.", "error");
      });
    },
    [items, signedIn, notify],
  );

  const value = useMemo<WishlistContextValue>(
    () => ({
      items,
      count: items.length,
      ready,
      saved: (productId: string) => isWishlisted(items, productId),
      toggle,
      remove,
    }),
    [items, ready, toggle, remove],
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return context;
}

function noopSubscribe(): () => void {
  return () => {};
}

function alwaysTrue(): boolean {
  return true;
}

function alwaysFalse(): boolean {
  return false;
}
