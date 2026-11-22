import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localePrefixFor } from "@/lib/locale-path";
import { pageMetadata } from "@/lib/metadata";
import type { AppLocale } from "@/i18n/routing";
import { getRequestContext } from "@/lib/auth";

import { WishlistView } from "./wishlist-view";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("wishlist");
  return pageMetadata({
    title: `${t("title")} — Gifto`,
    description: t("emptyBody"),
    path: `${localePrefixFor(locale)}/wishlist`,
    noIndex: true,
  });
}

export default async function WishlistPage() {
  const { user } = await getRequestContext();

  return <WishlistView signedIn={!!user} />;
}
