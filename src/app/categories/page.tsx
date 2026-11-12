import Link from "next/link";

import { CategoryTile } from "@/components/category-tile";
import { Container, EmptyState, Eyebrow } from "@/components/ui/section";
import { loadCategories } from "@/lib/catalog";

export const metadata = {
  title: "Shop by category",
  description:
    "Browse every gift category on Gifto and jump straight to the gifts you're after.",
};

export default async function CategoriesPage() {
  const result = await loadCategories();

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Eyebrow>Browse</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            Shop by category
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Product categories are set by the Gifto team, so the same groups work
            across every shop you browse.
          </p>
        </Container>
      </section>

      <Container className="pt-10">
        {!result.ok ? (
          <EmptyState title="We couldn't load categories">
            Something went wrong while loading categories. Please try again in a
            moment, or{" "}
            <Link href="/shops" className="text-berry hover:underline">
              browse shops instead
            </Link>
            .
          </EmptyState>
        ) : result.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.map((category, index) => (
              <CategoryTile
                key={category.id}
                category={category}
                index={index}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="Categories are on their way">
            Gifto categories are curated by the platform team and appear here as
            soon as they&apos;re published. In the meantime you can{" "}
            <Link href="/shops" className="text-berry hover:underline">
              browse shops
            </Link>{" "}
            or{" "}
            <Link href="/search" className="text-berry hover:underline">
              search gifts
            </Link>
            .
          </EmptyState>
        )}
      </Container>
    </div>
  );
}
