import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localePrefixFor } from "@/lib/locale-path";
import type { AppLocale } from "@/i18n/routing";

import { ShopCard } from "@/components/shop-card";
import { Container, EmptyState, Eyebrow } from "@/components/ui/section";
import { loadShopPreviews, loadShops } from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("shops");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: `${localePrefixFor(locale)}/shops`,
  });
}

export default async function ShopsPage() {
  const t = await getTranslations("shops");
  const [result, shopPreviews] = await Promise.all([
    loadShops(),
    loadShopPreviews(),
  ]);

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Eyebrow>{t("eyebrowIndex")}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            {t("subtitle")}
          </p>
        </Container>
      </section>

      <Container className="pt-10">
        {!result.ok ? (
          <EmptyState title={t("loadErrorTitle")}>
            {t.rich("loadErrorBody", {
              tryAgain: (chunks) => (
                <Link href="/shops" className="text-berry hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </EmptyState>
        ) : result.data.length === 0 ? (
          <EmptyState title={t("emptyTitle")}>
            {t.rich("emptyBody", {
              searchGifts: (chunks) => (
                <Link href="/search" className="text-berry hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </EmptyState>
        ) : (
          <>
            <p className="mb-6 text-sm text-ink-mute">
              {t("shopCount", { total: result.data.length })}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.map((shop) => (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  previews={
                    shopPreviews.ok ? (shopPreviews.data[shop.id] ?? []) : []
                  }
                />
              ))}
            </div>
          </>
        )}
      </Container>
    </div>
  );
}
