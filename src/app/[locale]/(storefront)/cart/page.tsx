import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ProductRail } from "@/components/product-rail";
import { loadNewArrivals } from "@/lib/catalog";
import { localePrefixFor } from "@/lib/locale-path";
import { pageMetadata } from "@/lib/metadata";
import type { AppLocale } from "@/i18n/routing";

import { CartView } from "./cart-view";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("cart");
  return pageMetadata({
    title: `${t("title")} — Gifto`,
    description: t("empty"),
    path: `${localePrefixFor(locale)}/cart`,
  });
}

export default async function CartPage() {
  const t = await getTranslations("cart");
  const recommendations = await loadNewArrivals(4);

  return (
    <CartView
      emptyRecommendations={
        recommendations.ok && recommendations.data.length > 0 ? (
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              {t("giftIdeas")}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">{t("giftIdeasBody")}</p>
            <div className="mt-4">
              <ProductRail products={recommendations.data} />
            </div>
          </div>
        ) : null
      }
    />
  );
}
