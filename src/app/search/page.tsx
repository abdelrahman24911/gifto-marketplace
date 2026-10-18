import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { SearchForm } from "@/components/search-form";
import { Container, EmptyState, Eyebrow } from "@/components/ui/section";
import { getCategories, searchProducts } from "@/lib/catalog";

export const metadata = {
  title: "Search gifts",
  description: "Search gifts across every shop on Gifto.",
};

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    min?: string;
    max?: string;
  }>;
};

const PRICE_FILTERS = [
  { label: "Under EGP 250", min: null, max: "250" },
  { label: "EGP 250 – 500", min: "250", max: "500" },
  { label: "EGP 500 and up", min: "500", max: null },
] as const;

/** Parse an EGP amount from the URL into integer piastres, or null if invalid. */
function parseEgpToMinor(value?: string): number | null {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const categorySlug = params.category?.trim() || undefined;
  const minMinor = parseEgpToMinor(params.min);
  const maxMinor = parseEgpToMinor(params.max);

  const [categories, result] = await Promise.all([
    getCategories(),
    searchProducts({ q, categorySlug, minMinor, maxMinor }),
  ]);

  const products = result.ok ? result.products : [];
  const activeCategory = categories.find((c) => c.slug === categorySlug);

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
          <Eyebrow>Search</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            Find the right gift
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
              All occasions
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
                key={filter.label}
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
                {filter.label}
              </Link>
            );
          })}
          {hasFilters ? (
            <Link
              href="/search"
              className="ml-1 text-sm font-medium text-ink-mute underline-offset-4 hover:text-berry hover:underline"
            >
              Clear all
            </Link>
          ) : null}
        </div>

        <div className="mt-8">
          {!result.ok ? (
            <EmptyState title="We couldn't load these results">
              Something went wrong while searching. Please try again in a moment.{" "}
              <Link href="/search" className="text-berry hover:underline">
                Restart your search
              </Link>
              .
            </EmptyState>
          ) : products.length === 0 ? (
            <EmptyState title="No gifts found">
              {q
                ? `Nothing matched “${q}”. Try a different word or clear your filters.`
                : "Try a different word or clear your filters to see everything."}
            </EmptyState>
          ) : (
            <>
              <p className="mb-6 text-sm text-ink-mute">
                {products.length}{" "}
                {products.length === 1 ? "gift" : "gifts"}
                {activeCategory ? ` in ${activeCategory.name}` : ""}
                {q ? ` for “${q}”` : ""}
                {activeBand ? ` · ${activeBand.label}` : ""}
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
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </Container>
    </div>
  );
}
