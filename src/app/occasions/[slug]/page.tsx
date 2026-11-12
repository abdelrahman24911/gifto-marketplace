import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { ProductCard } from "@/components/product-card";
import {
  Breadcrumb,
  Container,
  EmptyState,
  Eyebrow,
} from "@/components/ui/section";
import {
  getOccasions,
  loadOccasion,
  loadProductsByOccasion,
} from "@/lib/catalog";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadOccasion(slug);

  if (!result.ok || !result.data) {
    return { title: "Occasion" };
  }

  return {
    title: result.data.occasion.name,
    description:
      result.data.occasion.description ??
      `Gifts for ${result.data.occasion.name} on Gifto.`,
  };
}

export default async function OccasionPage({ params }: Props) {
  const { slug } = await params;
  const occasionResult = await loadOccasion(slug);

  if (!occasionResult.ok) {
    return (
      <Container className="py-16">
        <EmptyState title="We couldn't load this occasion">
          Something went wrong. Please{" "}
          <Link href="/occasions" className="text-berry hover:underline">
            go back to occasions
          </Link>{" "}
          or try again in a moment.
        </EmptyState>
      </Container>
    );
  }

  const lookup = occasionResult.data;
  if (!lookup) notFound();
  if (lookup.redirectFrom) {
    permanentRedirect(`/occasions/${lookup.occasion.slug}`);
  }

  const occasion = lookup.occasion;
  const [productsResult, occasions] = await Promise.all([
    loadProductsByOccasion(occasion.id),
    getOccasions(),
  ]);

  const products = productsResult.ok ? productsResult.data.items : [];
  const total = productsResult.ok ? productsResult.data.total : 0;
  const otherOccasions = occasions.filter(
    (other) => other.slug !== occasion.slug,
  );

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-14">
          <Breadcrumb
            items={[
              { href: "/", label: "Home" },
              { href: "/occasions", label: "Occasions" },
              { label: occasion.name },
            ]}
          />
          <Eyebrow>Occasion</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {occasion.name}
          </h1>
          {occasion.description ? (
            <p className="mt-4 max-w-2xl text-lg text-ink-soft">
              {occasion.description}
            </p>
          ) : null}
        </Container>
      </section>

      <Container className="pt-10">
        <section aria-labelledby="occasion-gifts">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="occasion-gifts" className="font-display text-2xl text-ink">
              Gifts for {occasion.name}
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
                href={`/occasions/${occasion.slug}`}
                className="text-berry hover:underline"
              >
                Try again
              </Link>
              .
            </EmptyState>
          ) : products.length === 0 ? (
            <EmptyState title="No gifts here yet">
              No gifts match this occasion yet.{" "}
              <Link href="/shops" className="text-berry hover:underline">
                Browse shops
              </Link>{" "}
              to keep looking.
            </EmptyState>
          ) : (
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
          )}
        </section>

        {otherOccasions.length > 0 ? (
          <section className="mt-14 border-t border-line pt-8">
            <h2 className="font-display text-xl text-ink">Other occasions</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {otherOccasions.map((other) => (
                <Link
                  key={other.id}
                  href={`/occasions/${other.slug}`}
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
