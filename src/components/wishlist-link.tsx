"use client";

import { useTranslations } from "next-intl";

import { HeartIcon } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import { useWishlist } from "@/components/wishlist-provider";

/** Header wishlist link, mirroring CartLink. Renders a stable label until the stored wishlist is read. */
export function WishlistLink({ className }: { className?: string }) {
  const t = useTranslations("common");
  const { count, ready } = useWishlist();

  return (
    <GuardedLink
      href="/wishlist"
      className={className}
      aria-label={
        ready && count > 0
          ? t("wishlistWithCount", { count })
          : t("wishlist")
      }
    >
      <HeartIcon className="h-5 w-5" />
      <span className="hidden sm:inline">{t("wishlist")}</span>
      {ready && count > 0 ? (
        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-berry px-1.5 text-xs font-semibold text-paper">
          {count}
        </span>
      ) : null}
    </GuardedLink>
  );
}
