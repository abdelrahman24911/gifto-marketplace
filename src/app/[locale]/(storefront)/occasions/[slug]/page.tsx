import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Link, permanentRedirect, redirect } from "@/i18n/navigation";
import { breadcrumbJsonLd } from "@/lib/breadcrumb-json-ld";
import { localePrefixFor } from "@/lib/locale-path";
import { serializeJsonLd } from "@/lib/product-json-ld";
import type { AppLocale } from "@/i18n/routing";

import {
  ArrowRightIcon,
  ChevronLeftIcon,
  HeartIcon,
} from "@/components/icons";
import { OccasionFallbackArt } from "@/components/occasion-artwork";
import { OccasionEmpty } from "@/components/occasion-empty";
import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/product-card";
import { toWishlistItem } from "@/lib/wishlist";
import { ProductImage } from "@/components/product-image";
import { ProductRail } from "@/components/product-rail";
import {
  Breadcrumb,
  Container,
  Eyebrow,
} from "@/components/ui/section";
import {
  getOccasions,
  loadNewArrivals,
  loadOccasion,
  loadProductsByOccasion,
  type CatalogOccasion,
} from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";
import {
  isSeedPlaceholderImage,
  occasionDisplayName,
} from "@/lib/occasion-display";
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  parsePage,
  totalPages,
} from "@/lib/pagination";
import { OCCASION_IMAGES_BUCKET } from "@/lib/supabase/database.types";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

const primaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-berry px-5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";
const secondaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-paper/80 px-5 text-sm font-semibold text-ink transition-colors hover:border-berry/35 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("occasions");
  const locale = (await getLocale()) as AppLocale;
  const result = await loadOccasion(slug);

  if (!result.ok) {
    return {
      title: t("unavailable"),
      robots: { index: false, follow: false },
    };
  }
  if (!result.data) notFound();

  const name = occasionDisplayName(
    result.data.occasion.slug,
    result.data.occasion.name,
    t,
  );

  return pageMetadata({
    title: name,
    description:
      result.data.occasion.description ??
      t("descriptionFallback", { name }),
    path: `${localePrefixFor(locale)}/occasions/${encodeURIComponent(result.data.occasion.slug)}`,
  });
}

function OccasionDetailMedia({
  occasion,
  name,
}: {
  occasion: CatalogOccasion;
  name: string;
}) {
  const fallbackArt = (
    <OccasionFallbackArt
      initial={name.trim().charAt(0).toUpperCase() || "?"}
      tone={occasion.slug.length}
    />
  );

  return (
    <div className="relative h-32 overflow-hidden rounded-[1.5rem] border border-line/70 bg-berry-soft/60 shadow-[0_24px_55px_-36px_rgba(121,13,43,0.5)] sm:h-44 md:h-auto md:aspect-[4/3] md:rounded-[1.75rem]">
      {isSeedPlaceholderImage(occasion.imagePath) ? (
        fallbackArt
      ) : (
        <ProductImage
          path={occasion.imagePath}
          alt={occasion.imageAlt ?? name}
          name={name}
          bucket={OCCASION_IMAGES_BUCKET}
          className="h-full w-full object-cover"
          rounded="rounded-none"
          sizes="(min-width: 1024px) 40vw, (min-width: 768px) 45vw, 100vw"
          preload={!!occasion.imagePath}
          fallback={fallbackArt}
        />
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-berry-deep/15 via-transparent to-paper/10"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-paper/25"
      />
      <HeartIcon className="absolute end-4 top-4 h-4 w-4 rotate-[10deg] text-berry/20" />
    </div>
  );
}

export default async function OccasionPage({ params, searchParams }: Props) {
  const t = await getTranslations("occasions");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as AppLocale;
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const requestedPage = parsePage(pageParam);
  const occasionResult = await loadOccasion(slug);

  if (!occasionResult.ok) {
    return (
      <Container className="py-12 sm:py-16">
        <OccasionEmpty
          title={t("loadErrorTitle")}
          description={t("loadErrorBody")}
          action={
            <>
              <Link href={`/occasions/${slug}`} className={primaryLinkClass}>
                {t("tryAgain")}
              </Link>
              <Link href="/occasions" className={secondaryLinkClass}>
                {t("allOccasions")}
              </Link>
            </>
          }
        />
      </Container>
    );
  }

  const lookup = occasionResult.data;
  if (!lookup) notFound();
  if (lookup.redirectFrom) {
    permanentRedirect({
      href: `/occasions/${lookup.occasion.slug}`,
      locale,
    });
  }

  const occasion = lookup.occasion;
  const occasionName = occasionDisplayName(
    occasion.slug,
    occasion.name,
    t,
  );
  const [productsResult, occasions, recommendations] = await Promise.all([
    loadProductsByOccasion(occasion.id, {
      page: requestedPage,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    getOccasions(),
    loadNewArrivals(4),
  ]);

  const products = productsResult.ok ? productsResult.data.items : [];
  const total = productsResult.ok ? productsResult.data.total : 0;
  const page = clampPage(requestedPage, total, DEFAULT_PAGE_SIZE);

  // A page past the end lands on the last page instead of an empty list
  // that claims the occasion has no gifts.
  if (productsResult.ok && total > 0 && requestedPage > totalPages(total, DEFAULT_PAGE_SIZE)) {
    redirect({ href: `/occasions/${occasion.slug}?page=${page}`, locale });
  }

  const buildPageHref = (nextPage: number) =>
    nextPage <= 1
      ? `/occasions/${occasion.slug}`
      : `/occasions/${occasion.slug}?page=${nextPage}`;
  const otherOccasions = occasions.filter(
    (other) => other.slug !== occasion.slug,
  );

  // P1-11: the CSP nonce the proxy generated for this request; the
  // BreadcrumbList JSON-LD block below must carry it or the enforced
  // script-src blocks it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const localePrefix = localePrefixFor(locale);
  const breadcrumbData = breadcrumbJsonLd([
    { name: tc("home"), path: localePrefix || "/" },
    { name: tc("occasions"), path: `${localePrefix}/occasions` },
    {
      name: occasionName,
      path: `${localePrefix}/occasions/${occasion.slug}`,
    },
  ]);

  return (
    <div className="pb-10">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbData) }}
      />
      <section className="relative overflow-hidden border-b border-line/60 bg-gradient-to-br from-paper via-paper-soft to-berry-soft">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-0 h-56 w-56 rounded-full bg-gold-soft/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-berry-soft/80 blur-3xl"
        />

        <Container className="relative py-7 sm:py-9 lg:py-12">
          <Breadcrumb
            ariaLabel={tc("breadcrumb")}
            items={[
              { href: "/", label: tc("home") },
              { href: "/occasions", label: tc("occasions") },
              { label: occasionName },
            ]}
          />

          <div className="mt-5 grid gap-5 md:grid-cols-[1.02fr_0.98fr] md:items-center md:gap-8 lg:gap-12">
            <div className="gifto-rise">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Eyebrow>{t("eyebrow")}</Eyebrow>
                <Link
                  href="/occasions"
                  className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-berry transition-colors hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                >
                  <ChevronLeftIcon className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100" />
                  {t("allOccasions")}
                </Link>
              </div>

              <h1 className="mt-3 font-display text-[clamp(2.65rem,7.2vw,4.9rem)] leading-[0.94] tracking-[-0.04em] text-ink">
                {occasionName}
              </h1>
              {occasion.description ? (
                <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
                  {occasion.description}
                </p>
              ) : null}
            </div>

            <div className="gifto-rise [animation-delay:100ms] md:justify-self-end md:w-full">
              <OccasionDetailMedia occasion={occasion} name={occasionName} />
            </div>
          </div>
        </Container>
      </section>

      <Container className="pt-8 sm:pt-10">
        <section aria-labelledby="occasion-gifts">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                id="occasion-gifts"
                className="font-display text-2xl leading-tight text-ink sm:text-3xl"
              >
                {t("giftsFor", { name: occasionName })}
              </h2>
              {productsResult.ok ? (
                <span className="rounded-full bg-paper-deep px-3 py-1 text-xs font-medium text-ink-mute">
                  {t("giftCount", { total })}
                </span>
              ) : null}
            </div>
          </div>

          {!productsResult.ok ? (
            <OccasionEmpty
              title={t("giftsLoadErrorTitle")}
              description={t("giftsLoadErrorBody")}
              action={
                <>
                  <Link
                    href={`/occasions/${occasion.slug}`}
                    className={primaryLinkClass}
                  >
                    {t("tryAgain")}
                  </Link>
                  <Link href="/occasions" className={secondaryLinkClass}>
                    {t("allOccasions")}
                  </Link>
                </>
              }
            />
          ) : products.length === 0 ? (
            <>
              <OccasionEmpty
                title={t("noGiftsTitle")}
                description={t("noGiftsBody")}
                action={
                  <>
                    <Link href="/shops" className={primaryLinkClass}>
                      {tc("browseShops")}
                    </Link>
                    <Link href="/occasions" className={secondaryLinkClass}>
                      {t("backToOccasions")}
                    </Link>
                  </>
                }
              />
              {recommendations.ok && recommendations.data.length > 0 ? (
                <div className="mt-10 border-t border-line pt-8">
                  <h2 className="font-display text-2xl leading-tight text-ink sm:text-3xl">
                    {t("freshIdeas")}
                  </h2>
                  <p className="mt-2 text-ink-soft">
                    {t("freshIdeasBody")}
                  </p>
                  <div className="mt-5">
                    <ProductRail products={recommendations.data} />
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    href={`/shops/${product.vendorSlug}/${product.slug}`}
                    name={product.name}
                    priceMinor={product.priceMinor}
                    stock={product.stock}
                    imagePath={product.imagePath}
                    imageAlt={product.imageAlt}
                    vendorName={product.vendorName}
                    wishlistItem={toWishlistItem(product)}
                  />
                ))}
              </div>
              <Pagination
                page={page}
                total={total}
                pageSize={DEFAULT_PAGE_SIZE}
                buildHref={buildPageHref}
                label={t("paginationLabel")}
              />
            </>
          )}
        </section>

        {otherOccasions.length > 0 ? (
          <section className="mt-12 border-t border-line pt-8 sm:mt-16">
            <Eyebrow>{t("keepExploring")}</Eyebrow>
            <h2 className="mt-2 font-display text-2xl leading-tight text-ink sm:text-3xl">
              {t("moreMoments")}
            </h2>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {otherOccasions.map((other) => (
                <Link
                  key={other.id}
                  href={`/occasions/${other.slug}`}
                  className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper-soft/80 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/35 hover:bg-berry-soft/60 hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                >
                  {occasionDisplayName(other.slug, other.name, t)}
                  <ArrowRightIcon className="h-3.5 w-3.5 text-berry/60 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </Container>
    </div>
  );
}
