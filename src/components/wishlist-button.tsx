"use client";

import { useTranslations } from "next-intl";

import { HeartIcon } from "@/components/icons";
import { useToast } from "@/components/toast-provider";
import { useWishlist } from "@/components/wishlist-provider";
import type { WishlistItem } from "@/lib/wishlist";

/**
 * Save-to-wishlist toggle. `icon` is the heart on product cards;
 * `full` is the labelled button on the product detail page. The toast
 * announces the result — the button's pressed state alone is not enough
 * feedback when the save also syncs to the account in the background.
 */
export function WishlistButton({
  item,
  variant = "icon",
  className = "",
}: {
  item: WishlistItem;
  variant?: "icon" | "full";
  className?: string;
}) {
  const t = useTranslations("wishlist");
  const { saved, toggle } = useWishlist();
  const { notify } = useToast();
  const isSaved = saved(item.productId);

  function onToggle(): void {
    toggle(item);
    notify(
      isSaved
        ? t("removed", { name: item.name })
        : t("added", { name: item.name }),
      "info",
    );
  }

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isSaved}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry ${
          isSaved
            ? "border-berry/45 bg-berry-soft text-berry-deep"
            : "border-line bg-paper text-ink-soft hover:border-berry/45 hover:text-berry-deep"
        } ${className}`}
      >
        <HeartIcon
          className="h-4 w-4"
          fill={isSaved ? "currentColor" : undefined}
        />
        {isSaved ? t("saved") : t("save")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isSaved}
      aria-label={
        isSaved
          ? t("removeFromWishlist", { name: item.name })
          : t("saveToWishlist", { name: item.name })
      }
      title={isSaved ? t("saved") : t("save")}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry ${
        isSaved
          ? "border-berry/45 bg-berry-soft text-berry"
          : "border-line bg-paper text-ink-mute hover:border-berry/45 hover:text-berry"
      } ${className}`}
    >
      <HeartIcon
        className="h-4 w-4"
        fill={isSaved ? "currentColor" : undefined}
      />
    </button>
  );
}
