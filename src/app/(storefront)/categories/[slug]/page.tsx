import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/product-card";
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
  const result = await loadCategory(slug);

  if (!result.ok) {
    return {
      title: "Category unavailable",
      robots: { index: false, follow: false },
    };
  }
  if (!result.data) notFound();

  return pageMetadata({
    title: result.data.name,
    description:
      result.data.description ?? `Gifts in ${result.data.name} on Gifto.`,
    path: `/categories/${encodeURIComponent(result.data.slug)}`,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const requestedPage = parsePage(pageParam);
  const categoryResult = await loadCategory(slug);

  if (!categoryResult.ok) {
    return (
      <Container className="py-16">
        <EmptyState title="We couldn't load this category">
          Something went wrong. Please{" "}
          <Link href="/categories" className="text-berry hover:underline">
            go back to categories
          </Link>{" "}
          or try again in a moment.
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
    redirect(`/categories/${category.slug}?page=${page}`);
  }

  const buildPageHref = (nextPage: number) =>
    nextPage <= 1
      ? `/categories/${category.slug}`
      : `/categories/${category.slug}?page=${nextPage}`;
  const otherCategories = categories.filter((c) => c.slug !== category.slug);

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-14">
          <Breadcrumb
            items={[
              { href: "/", label: "Home" },
              { href: "/categories", label: "Categories" },
              { label: category.name },
            ]}
          />
          <Eyebrow>Category</Eyebrow>
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
              Gifts in {category.name}
            </h2>
            {productsResult.ok ? (
              <p className="text-sm text-ink-mute">
                {total} {total === 1 ? "gift" : "gifts"}
              </p>
            ) : null}
          </div>

          {!productsResult.ok ? (
            <EmptyState title="We couldn't load these gifts">
              The catalogue didn&apos;t respond.{" "}
              <Link
                href={`/categories/${category.slug}`}
                className="text-berry hover:underline"
              >
                Try again
              </Link>
              .
            </EmptyState>
          ) : products.length === 0 ? (
            <EmptyState title="No gifts here yet">
              No shop has listed a gift in {category.name} yet.{" "}
              <Link href="/shops" className="text-berry hover:underline">
                Browse shops
              </Link>{" "}
              to keep looking.
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
                  />
                ))}
              </div>
              <Pagination
                page={page}
                total={total}
                pageSize={DEFAULT_PAGE_SIZE}
                buildHref={buildPageHref}
                label="Category pagination"
              />
            </>
          )}
        </section>

        {otherCategories.length > 0 ? (
          <section className="mt-14 border-t border-line pt-8">
            <h2 className="font-display text-xl text-ink">Other categories</h2>
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
