import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Link, redirect } from "@/i18n/navigation";
import { breadcrumbJsonLd } from "@/lib/breadcrumb-json-ld";
import { localePrefixFor } from "@/lib/locale-path";
import { serializeJsonLd } from "@/lib/product-json-ld";
import type { AppLocale } from "@/i18n/routing";

import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/product-card";
import { toWishlistItem } from "@/lib/wishlist";
import {
  Breadcrumb,
  Container,
  EmptyState,
  Eyebrow,
} from "@/components/ui/section";
import {
  getCategories,
  loadCategory,
  loadProductsByCategory,
} from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  parsePage,
  totalPages,
} from "@/lib/pagination";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("categories");
  const locale = (await getLocale()) as AppLocale;
  const result = await loadCategory(slug);

  if (!result.ok) {
    return {
      title: t("unavailable"),
      robots: { index: false, follow: false },
    };
  }
  if (!result.data) notFound();

  return pageMetadata({
    title: result.data.name,
    description:
      result.data.description ??
      t("descriptionFallback", { name: result.data.name }),
    path: `${localePrefixFor(locale)}/categories/${encodeURIComponent(result.data.slug)}`,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: Props) {
  const t = await getTranslations("categories");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as AppLocale;
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const requestedPage = parsePage(pageParam);
  const categoryResult = await loadCategory(slug);

  if (!categoryResult.ok) {
    return (
      <Container className="py-16">
        <EmptyState title={t("loadErrorTitleSlug")}>
          {t.rich("loadErrorBodySlug", {
            back: (chunks) => (
              <Link href="/categories" className="text-berry hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </EmptyState>
      </Container>
    );
  }

  const category = categoryResult.data;
  if (!category) notFound();

  const [productsResult, categories] = await Promise.all([
    loadProductsByCategory(category.id, {
      page: requestedPage,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    getCategories(),
  ]);

  const products = productsResult.ok ? productsResult.data.items : [];
  const total = productsResult.ok ? productsResult.data.total : 0;
  const page = clampPage(requestedPage, total, DEFAULT_PAGE_SIZE);

  // A page past the end (e.g. after products were removed) lands on the
  // last page instead of an empty list that claims the category is empty.
  if (productsResult.ok && total > 0 && requestedPage > totalPages(total, DEFAULT_PAGE_SIZE)) {
    redirect({ href: `/categories/${category.slug}?page=${page}`, locale });
  }

  const buildPageHref = (nextPage: number) =>
    nextPage <= 1
      ? `/categories/${category.slug}`
      : `/categories/${category.slug}?page=${nextPage}`;
  const otherCategories = categories.filter((c) => c.slug !== category.slug);

  // P1-11: the CSP nonce the proxy generated for this request; the
  // BreadcrumbList JSON-LD block below must carry it or the enforced
  // script-src blocks it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const localePrefix = localePrefixFor(locale);
  const breadcrumbData = breadcrumbJsonLd([
    { name: tc("home"), path: localePrefix || "/" },
    { name: tc("categories"), path: `${localePrefix}/categories` },
    {
      name: category.name,
      path: `${localePrefix}/categories/${category.slug}`,
    },
  ]);

  return (
    <div className="pb-8">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbData) }}
      />
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-14">
          <Breadcrumb
            ariaLabel={tc("breadcrumb")}
            items={[
              { href: "/", label: tc("home") },
              { href: "/categories", label: tc("categories") },
              { label: category.name },
            ]}
          />
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {category.name}
          </h1>
          {category.description ? (
            <p className="mt-4 max-w-2xl text-lg text-ink-soft">
              {category.description}
            </p>
          ) : null}
        </Container>
      </section>

      <Container className="pt-10">
        <section aria-labelledby="category-gifts">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2
              id="category-gifts"
              className="font-display text-2xl text-ink"
            >
              {t("giftsIn", { name: category.name })}
            </h2>
            {productsResult.ok ? (
              <p className="text-sm text-ink-mute">
                {t("giftCount", { total })}
              </p>
            ) : null}
          </div>

          {!productsResult.ok ? (
            <EmptyState title={t("giftsLoadErrorTitle")}>
            {t.rich("giftsLoadErrorBody", {
              tryAgain: (chunks) => (
                <Link
                  href={`/categories/${category.slug}`}
                  className="text-berry hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </EmptyState>
          ) : products.length === 0 ? (
            <EmptyState title={t("noGiftsTitle")}>
              {t.rich("noGiftsBody", {
                name: category.name,
                browseShops: (chunks) => (
                  <Link href="/shops" className="text-berry hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </EmptyState>
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

        {otherCategories.length > 0 ? (
          <section className="mt-14 border-t border-line pt-8">
            <h2 className="font-display text-xl text-ink">{t("otherCategories")}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {otherCategories.map((other) => (
                <Link
                  key={other.id}
                  href={`/categories/${other.slug}`}
                  className="rounded-full border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:text-berry"
                >
                  {other.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </Container>
    </div>
  );
}
