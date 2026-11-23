import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Link, redirect } from "@/i18n/navigation";
import { localePrefixFor } from "@/lib/locale-path";
import type { AppLocale } from "@/i18n/routing";

import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/product-card";
import { toWishlistItem } from "@/lib/wishlist";
import { SearchForm } from "@/components/search-form";
import { Container, EmptyState, Eyebrow } from "@/components/ui/section";
import { getCategories, searchProducts } from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";
import { parseEgpToMinor } from "@/lib/money";
import {
  clampPage,
  DEFAULT_PAGE_SIZE,
  parsePage,
  totalPages,
} from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("search");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: `${localePrefixFor(locale)}/search`,
    noIndex: true,
  });
}

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    min?: string;
    max?: string;
    page?: string;
  }>;
};

// Price-band labels are translated at render time (see `priceBandLabel` in
// the page component); the band keys below are stable identifiers.
const PRICE_FILTERS = [
  { key: "under250", min: null, max: "250" },
  { key: "range250500", min: "250", max: "500" },
  { key: "over500", min: "500", max: null },
] as const;

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const t = await getTranslations("search");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as AppLocale;
  const priceBandLabel = (key: string) =>
    key === "under250"
      ? t("under250")
      : key === "range250500"
        ? t("range250500")
        : t("over500");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const categorySlug = params.category?.trim() || undefined;
  const minMinor = parseEgpToMinor(params.min ?? "");
  const maxMinor = parseEgpToMinor(params.max ?? "");
  const requestedPage = parsePage(params.page);

  const [categories, result] = await Promise.all([
    getCategories(),
    searchProducts({
      q,
      categorySlug,
      minMinor,
      maxMinor,
      page: requestedPage,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
  ]);

  const products = result.ok ? result.products : [];
  const total = result.ok ? result.total : 0;
  const page = clampPage(requestedPage, total, DEFAULT_PAGE_SIZE);
  const activeCategory = categories.find((c) => c.slug === categorySlug);

  // A page past the end lands on the last page instead of an empty
  // result that claims nothing matched.
  if (
    result.ok &&
    total > 0 &&
    requestedPage > totalPages(total, DEFAULT_PAGE_SIZE)
  ) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (categorySlug) next.set("category", categorySlug);
    if (params.min) next.set("min", params.min);
    if (params.max) next.set("max", params.max);
    next.set("page", String(page));
    redirect({ href: `/search?${next.toString()}`, locale });
  }

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      q: q || undefined,
      category: categorySlug,
      min: params.min || undefined,
      max: params.max || undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/search?${query}` : "/search";
  };

  // Filter links reset to page 1; the Pagination control sets the page.
  const buildPageHref = (nextPage: number) =>
    buildHref({ page: nextPage <= 1 ? undefined : String(nextPage) });

  const hasFilters = Boolean(q || categorySlug || minMinor !== null || maxMinor !== null);
  const activeBand = PRICE_FILTERS.find(
    (filter) =>
      (filter.min ?? null) === (params.min || null) &&
      (filter.max ?? null) === (params.max || null),
  );

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Eyebrow>{tc("search")}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {t("heading")}
          </h1>
          <div className="mt-6 max-w-xl">
            <SearchForm defaultValue={q} />
          </div>
        </Container>
      </section>

      <Container className="pt-8">
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ category: undefined })}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                !categorySlug
                  ? "border-berry bg-berry text-paper"
                  : "border-line bg-paper-soft text-ink hover:border-berry/40 hover:text-berry"
              }`}
            >
              {t("allOccasions")}
            </Link>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={buildHref({ category: category.slug })}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  categorySlug === category.slug
                    ? "border-berry bg-berry text-paper"
                    : "border-line bg-paper-soft text-ink hover:border-berry/40 hover:text-berry"
                }`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PRICE_FILTERS.map((filter) => {
            return (
              <Link
                key={filter.key}
                href={buildHref({
                  min: activeBand === filter ? undefined : (filter.min ?? undefined),
                  max: activeBand === filter ? undefined : (filter.max ?? undefined),
                })}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  activeBand === filter
                    ? "border-berry bg-berry-soft text-berry-deep"
                    : "border-line bg-paper-soft text-ink-soft hover:border-berry/40 hover:text-berry"
                }`}
              >
                {priceBandLabel(filter.key)}
              </Link>
            );
          })}
          {hasFilters ? (
            <Link
              href="/search"
              className="ml-1 text-sm font-medium text-ink-mute underline-offset-4 hover:text-berry hover:underline"
            >
              {t("clearAll")}
            </Link>
          ) : null}
        </div>

        <div className="mt-8">
          {!result.ok ? (
            <EmptyState title={t("loadErrorTitle")}>
              {t("loadErrorBody")}{" "}
              <Link href="/search" className="text-berry hover:underline">
                {t("restartSearch")}
              </Link>
              .
            </EmptyState>
          ) : products.length === 0 ? (
            <EmptyState title={t("noResultsTitle")}>
              {q ? t("noResultsFor", { q }) : t("noResults")}
            </EmptyState>
          ) : (
            <>
              <p className="mb-6 break-words text-sm text-ink-mute">
                {t("resultCount", { total })}
                {activeCategory ? ` ${t("inCategory", { name: activeCategory.name })}` : ""}
                {q ? ` ${t("forQuery", { q })}` : ""}
                {activeBand ? ` · ${priceBandLabel(activeBand.key)}` : ""}
              </p>
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
                    categoryName={product.categoryName}
                    reviewSummary={product.reviewSummary}
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
        </div>
      </Container>
    </div>
  );
}
