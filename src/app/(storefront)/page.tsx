import type { Metadata } from "next";

import { CategoryTile } from "@/components/category-tile";
import { GiftFinderSection } from "@/components/home/gift-finder-section";
import { HomeHero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { OccasionTile } from "@/components/occasion-tile";
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

const description =
  "Discover thoughtful gifts from independent Egyptian gift shops — browse by occasion, category, or budget, use Gift Finder, and pay cash on delivery.";

export const metadata: Metadata = pageMetadata({
  title: "Gifts in Egypt, wrapped properly",
  description,
  path: "/",
  socialTitle: "Gifto — Gifts in Egypt, wrapped properly",
});

export default async function HomePage() {
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
        name: occasionDisplayName(occasion.slug, occasion.name),
        slug: occasion.slug,
      }))
    : [];

  return (
    <div className="pb-4">
      <HomeHero />

      {/* Shop by occasion */}
      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Find the moment"
            title="Shop by occasion"
            description="Start with the moment you're celebrating, then find a gift that feels just right."
            href="/occasions"
            linkLabel="Explore all occasions"
          />
          {occasions.ok ? (
            occasions.data.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
                {occasions.data.slice(0, 6).map((occasion, index) => (
                  <OccasionTile
                    key={occasion.id}
                    occasion={occasion}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="Occasions are on their way">
                Gifto occasions appear here as soon as the platform team
                publishes them.
              </EmptyState>
            )
          ) : (
            <SectionError title="We couldn't load occasions">
              Refresh the page to try again.
            </SectionError>
          )}
        </Container>
      </section>

      {/* Shop by category */}
      <section className="border-t border-line bg-paper-soft/55 py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Browse the collection"
            title="Shop by category"
            description="Flowers, sweets, keepsakes and more — find the kind of gift you have in mind."
            href="/categories"
            linkLabel="All categories"
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
              <EmptyState title="Categories are on their way">
                Gifto categories appear here as soon as the platform team
                publishes them.
              </EmptyState>
            )
          ) : (
            <SectionError title="We couldn't load categories">
              Refresh the page to try again.
            </SectionError>
          )}
        </Container>
      </section>

      {/* Fresh Picks */}
      <section id="fresh-picks" className="scroll-mt-24 py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Just added"
            title="Fresh Picks"
            description="The newest gifts from independent shops — before they settle into the collection."
            href="/search"
            linkLabel="Browse all gifts"
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
              <EmptyState title="No gifts listed yet">
                As soon as shops publish their first products, they&apos;ll
                appear here.
              </EmptyState>
            )
          ) : (
            <SectionError title="We couldn't load Fresh Picks">
              Refresh the page to try again.
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
            eyebrow="Independent makers"
            title="Shops worth browsing"
            description="Every shop on Gifto is reviewed and approved before it goes live."
            href="/shops"
            linkLabel="All shops"
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
              <EmptyState title="No shops yet">
                Approved shops appear here as soon as they go live on Gifto.
              </EmptyState>
            )
          ) : (
            <SectionError title="We couldn't load shops">
              Refresh the page to try again.
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
              The right gift is closer than you think.
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-berry-tint">
              Start with Gift Finder, or browse every gift from every shop —
              then check out with cash on delivery.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <GuardedLink
                href="/#gift-finder"
                className="inline-flex h-12 items-center rounded-full bg-paper px-6 text-sm font-semibold text-berry-deep transition-colors hover:bg-paper-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
              >
                Find a gift
              </GuardedLink>
              <GuardedLink
                href="/search"
                className="inline-flex h-12 items-center rounded-full border border-paper/40 px-6 text-sm font-semibold text-paper transition-colors hover:bg-paper/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
              >
                Browse all gifts
              </GuardedLink>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
