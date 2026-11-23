import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { CategoryTile } from "@/components/category-tile";
import { GiftFinderSection } from "@/components/home/gift-finder-section";
import { HomeHero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { OccasionCarousel } from "@/components/occasion-carousel";
import { ProductCard } from "@/components/product-card";
import { ShopCard } from "@/components/shop-card";
import { GuardedLink } from "@/components/navigation-guard";
import {
  Container,
  EmptyState,
  SectionError,
  SectionHeading,
} from "@/components/ui/section";
import {
  loadCategories,
  loadCategoryPreviews,
  loadGiftFinderPage,
  loadNewArrivals,
  loadOccasions,
  loadShopPreviews,
  loadShops,
} from "@/lib/catalog";
import { GIFT_FINDER_PAGE_SIZE } from "@/lib/gift-finder";
import { pageMetadata } from "@/lib/metadata";
import { occasionDisplayName } from "@/lib/occasion-display";
import { toQuickAddItem } from "@/lib/quick-add";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("home");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: locale === "ar" ? "/ar" : "/",
    socialTitle: `Gifto — ${t("title")}`,
  });
}

export default async function HomePage() {
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const to = await getTranslations("occasions");
  const [
    occasions,
    categories,
    freshPicks,
    shops,
    giftFinderPage,
    categoryPreviews,
    shopPreviews,
  ] = await Promise.all([
    loadOccasions(),
    loadCategories(),
    loadNewArrivals(8),
    loadShops(4),
    loadGiftFinderPage({
      recipient: "any",
      occasionSlug: null,
      budget: "any",
      offset: 0,
      limit: GIFT_FINDER_PAGE_SIZE,
    }),
    loadCategoryPreviews(),
    loadShopPreviews(),
  ]);

  const giftFinderOccasions = occasions.ok
    ? occasions.data.map((occasion) => ({
        name: occasionDisplayName(occasion.slug, occasion.name, to),
        slug: occasion.slug,
      }))
    : [];

  return (
    <div className="pb-4">
      <HomeHero />

      {/* Shop by occasion */}
      <section className="py-10 sm:py-12">
        <Container>
          {occasions.ok ? (
            occasions.data.length > 0 ? (
              <OccasionCarousel
                occasions={occasions.data}
                eyebrow={t("occasionsEyebrow")}
                title={t("occasionsTitle")}
                description={t("occasionsDescription")}
                exploreHref="/occasions"
                exploreLabel={t("exploreAllOccasions")}
              />
            ) : (
              <>
                <SectionHeading
                  eyebrow={t("occasionsEyebrow")}
                  title={t("occasionsTitle")}
                  description={t("occasionsDescription")}
                  href="/occasions"
                  linkLabel={t("exploreAllOccasions")}
                />
                <EmptyState title={t("occasionsEmpty")}>
                  {t("occasionsEmptyBody")}
                </EmptyState>
              </>
            )
          ) : (
            <>
              <SectionHeading
                eyebrow={t("occasionsEyebrow")}
                title={t("occasionsTitle")}
                description={t("occasionsDescription")}
                href="/occasions"
                linkLabel={t("exploreAllOccasions")}
              />
              <SectionError title={t("occasionsError")}>
                {tc("refreshToRetry")}
              </SectionError>
            </>
          )}
        </Container>
      </section>

      {/* Shop by category */}
      <section className="border-t border-line bg-paper-soft/55 py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow={t("categoriesEyebrow")}
            title={t("categoriesTitle")}
            description={t("categoriesDescription")}
            href="/categories"
            linkLabel={t("allCategories")}
          />
          {categories.ok ? (
            categories.data.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {categories.data.slice(0, 8).map((category, index) => (
                  <CategoryTile
                    key={category.id}
                    category={category}
                    index={index}
                    previews={
                      categoryPreviews.ok
                        ? (categoryPreviews.data[category.id] ?? [])
                        : []
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState title={t("categoriesEmpty")}>
                {t("categoriesEmptyBody")}
              </EmptyState>
            )
          ) : (
            <SectionError title={t("categoriesError")}>
              {tc("refreshToRetry")}
            </SectionError>
          )}
        </Container>
      </section>

      {/* Fresh Picks */}
      <section id="fresh-picks" className="scroll-mt-24 py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow={t("freshPicksEyebrow")}
            title={t("freshPicksTitle")}
            description={t("freshPicksDescription")}
            href="/search"
            linkLabel={t("browseAllGifts")}
          />
          {freshPicks.ok ? (
            freshPicks.data.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                {freshPicks.data.map((product) => {
                  const item = toQuickAddItem(product);

                  return (
                    <ProductCard
                      key={product.id}
                      href={`/shops/${product.vendorSlug}/${product.slug}`}
                      name={product.name}
                      priceMinor={product.priceMinor}
                      stock={product.stock}
                      imagePath={product.imagePath}
                      imageAlt={product.imageAlt}
                      vendorName={product.vendorName}
                      categoryName={product.categoryName}
                      reviewSummary={product.reviewSummary}
                      quickAdd={
                        item
                          ? {
                              item,
                              acceptingOrders:
                                product.vendorIsAcceptingOrders,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState title={t("freshPicksEmpty")}>
                {t("freshPicksEmptyBody")}
              </EmptyState>
            )
          ) : (
            <SectionError title={t("freshPicksError")}>
              {tc("refreshToRetry")}
            </SectionError>
          )}
        </Container>
      </section>

      <GiftFinderSection
        page={giftFinderPage.ok ? giftFinderPage.data : null}
        occasions={giftFinderOccasions}
      />

      <HowItWorks />

      {/* Featured shops */}
      <section className="border-t border-line bg-paper-soft/55 py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow={t("shopsEyebrow")}
            title={t("shopsTitle")}
            description={t("shopsDescription")}
            href="/shops"
            linkLabel={t("allShops")}
          />
          {shops.ok ? (
            shops.data.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {shops.data.map((shop) => (
                  <ShopCard
                    key={shop.id}
                    shop={shop}
                    previews={
                      shopPreviews.ok ? (shopPreviews.data[shop.id] ?? []) : []
                    }
                  />
                ))}
              </div>
            ) : (
              <EmptyState title={t("shopsEmpty")}>
                {t("shopsEmptyBody")}
              </EmptyState>
            )
          ) : (
            <SectionError title={t("shopsError")}>
              {tc("refreshToRetry")}
            </SectionError>
          )}
        </Container>
      </section>

      {/* Closing CTA */}
      <section className="pt-16 sm:pt-20">
        <Container>
          <div className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-berry to-berry-deep px-8 py-12 text-center sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gold/15 blur-2xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-berry-soft/15 blur-2xl"
            />
            <h2 className="relative font-display text-3xl leading-tight text-paper sm:text-4xl">
              {t("closingTitle")}
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-berry-tint">
              {t("closingBody")}
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <GuardedLink
                href="/#gift-finder"
                className="inline-flex h-12 items-center rounded-full bg-paper px-6 text-sm font-semibold text-berry-deep transition-colors hover:bg-paper-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
              >
                {t("findGift")}
              </GuardedLink>
              <GuardedLink
                href="/search"
                className="inline-flex h-12 items-center rounded-full border border-paper/40 px-6 text-sm font-semibold text-paper transition-colors hover:bg-paper/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
              >
                {t("browseAllGifts")}
              </GuardedLink>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
