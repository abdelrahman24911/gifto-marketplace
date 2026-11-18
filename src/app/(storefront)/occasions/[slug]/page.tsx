import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import {
  ArrowRightIcon,
  ChevronLeftIcon,
  HeartIcon,
} from "@/components/icons";
import { OccasionFallbackArt } from "@/components/occasion-artwork";
import { OccasionEmpty } from "@/components/occasion-empty";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import {
  Breadcrumb,
  Container,
  Eyebrow,
} from "@/components/ui/section";
import {
  getOccasions,
  loadOccasion,
  loadProductsByOccasion,
  type CatalogOccasion,
} from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";
import { occasionDisplayName } from "@/lib/occasion-display";
import { OCCASION_IMAGES_BUCKET } from "@/lib/supabase/database.types";

type Props = { params: Promise<{ slug: string }> };

const primaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-berry px-5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";
const secondaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-paper/80 px-5 text-sm font-semibold text-ink transition-colors hover:border-berry/35 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadOccasion(slug);

  if (!result.ok) {
    return {
      title: "Occasion unavailable",
      robots: { index: false, follow: false },
    };
  }
  if (!result.data) notFound();

  const name = occasionDisplayName(
    result.data.occasion.slug,
    result.data.occasion.name,
  );

  return pageMetadata({
    title: name,
    description:
      result.data.occasion.description ?? `Gifts for ${name} on Gifto.`,
    path: `/occasions/${encodeURIComponent(result.data.occasion.slug)}`,
  });
}

function OccasionDetailMedia({ occasion }: { occasion: CatalogOccasion }) {
  const name = occasionDisplayName(occasion.slug, occasion.name);

  return (
    <div className="relative h-32 overflow-hidden rounded-[1.5rem] border border-line/70 bg-berry-soft/60 shadow-[0_24px_55px_-36px_rgba(121,13,43,0.5)] sm:h-44 md:h-auto md:aspect-[4/3] md:rounded-[1.75rem]">
      <ProductImage
        path={occasion.imagePath}
        alt={occasion.imageAlt ?? name}
        name={name}
        bucket={OCCASION_IMAGES_BUCKET}
        className="h-full w-full object-cover"
        rounded="rounded-none"
        sizes="(min-width: 1024px) 40vw, (min-width: 768px) 45vw, 100vw"
        preload={!!occasion.imagePath}
        fallback={
          <OccasionFallbackArt
            initial={name.trim().charAt(0).toUpperCase() || "?"}
            tone={occasion.slug.length}
          />
        }
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-berry-deep/15 via-transparent to-paper/10"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-paper/25"
      />
      <HeartIcon className="absolute right-4 top-4 h-4 w-4 rotate-[10deg] text-berry/20" />
    </div>
  );
}

export default async function OccasionPage({ params }: Props) {
  const { slug } = await params;
  const occasionResult = await loadOccasion(slug);

  if (!occasionResult.ok) {
    return (
      <Container className="py-12 sm:py-16">
        <OccasionEmpty
          title="We couldn't load this occasion"
          description="Something went wrong while loading this collection. Please try again in a moment."
          action={
            <>
              <Link href={`/occasions/${slug}`} className={primaryLinkClass}>
                Try again
              </Link>
              <Link href="/occasions" className={secondaryLinkClass}>
                All occasions
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
    permanentRedirect(`/occasions/${lookup.occasion.slug}`);
  }

  const occasion = lookup.occasion;
  const occasionName = occasionDisplayName(occasion.slug, occasion.name);
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
    <div className="pb-10">
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
            items={[
              { href: "/", label: "Home" },
              { href: "/occasions", label: "Occasions" },
              { label: occasionName },
            ]}
          />

          <div className="mt-5 grid gap-5 md:grid-cols-[1.02fr_0.98fr] md:items-center md:gap-8 lg:gap-12">
            <div className="gifto-rise">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Eyebrow>Occasion</Eyebrow>
                <Link
                  href="/occasions"
                  className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-berry transition-colors hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                >
                  <ChevronLeftIcon className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
                  All occasions
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
              <OccasionDetailMedia occasion={occasion} />
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
                Gifts for {occasionName}
              </h2>
              {productsResult.ok ? (
                <span className="rounded-full bg-paper-deep px-3 py-1 text-xs font-medium text-ink-mute">
                  {total} {total === 1 ? "gift" : "gifts"}
                </span>
              ) : null}
            </div>
          </div>

          {!productsResult.ok ? (
            <OccasionEmpty
              title="We couldn't load these gifts"
              description="The catalogue didn't respond. Try again, or keep browsing other occasions."
              action={
                <>
                  <Link
                    href={`/occasions/${occasion.slug}`}
                    className={primaryLinkClass}
                  >
                    Try again
                  </Link>
                  <Link href="/occasions" className={secondaryLinkClass}>
                    All occasions
                  </Link>
                </>
              }
            />
          ) : products.length === 0 ? (
            <OccasionEmpty
              title="No gifts here yet"
              description="No gifts match this occasion yet. Browse the shops to keep looking, or explore another moment."
              action={
                <>
                  <Link href="/shops" className={primaryLinkClass}>
                    Browse shops
                  </Link>
                  <Link href="/occasions" className={secondaryLinkClass}>
                    Back to occasions
                  </Link>
                </>
              }
            />
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
          <section className="mt-12 border-t border-line pt-8 sm:mt-16">
            <Eyebrow>Keep exploring</Eyebrow>
            <h2 className="mt-2 font-display text-2xl leading-tight text-ink sm:text-3xl">
              More moments
            </h2>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {otherOccasions.map((other) => (
                <Link
                  key={other.id}
                  href={`/occasions/${other.slug}`}
                  className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper-soft/80 px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/35 hover:bg-berry-soft/60 hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                >
                  {occasionDisplayName(other.slug, other.name)}
                  <ArrowRightIcon className="h-3.5 w-3.5 text-berry/60 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </Container>
    </div>
  );
}
