import type { Metadata } from "next";
import Link from "next/link";

import { OccasionEmpty } from "@/components/occasion-empty";
import { OccasionHero } from "@/components/occasion-hero";
import { ProductRail } from "@/components/product-rail";
import { Container, SectionHeading } from "@/components/ui/section";
import { loadNewArrivals, loadOccasions } from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";

import { OccasionBrowser } from "./occasion-browser";

export const metadata: Metadata = pageMetadata({
  title: "Shop by occasion",
  description:
    "Browse gifts by the moment you're celebrating — birthdays, weddings, graduations and more.",
  path: "/occasions",
});

const primaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-berry px-5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";
const secondaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-paper/80 px-5 text-sm font-semibold text-ink transition-colors hover:border-berry/35 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";

export default async function OccasionsPage() {
  const [result, recommendations] = await Promise.all([
    loadOccasions(),
    loadNewArrivals(4),
  ]);

  return (
    <div className="pb-8">
      <OccasionHero />

      <Container className="pt-8 sm:pt-10">
        {!result.ok ? (
          <OccasionEmpty
            title="We couldn't load occasions"
            description="Something went wrong while loading the collection. Please try again in a moment, or browse the shops directly."
            action={
              <>
                <Link href="/occasions" className={primaryLinkClass}>
                  Try again
                </Link>
                <Link href="/shops" className={secondaryLinkClass}>
                  Browse shops
                </Link>
              </>
            }
          />
        ) : result.data.length > 0 ? (
          <OccasionBrowser occasions={result.data} />
        ) : (
          <OccasionEmpty
            title="Occasions are on their way"
            description="Gifto occasions are curated by the platform team and appear here as soon as they're published. In the meantime, keep exploring another way."
            action={
              <>
                <Link href="/categories" className={primaryLinkClass}>
                  Browse categories
                </Link>
                <Link href="/search" className={secondaryLinkClass}>
                  Search gifts
                </Link>
              </>
            }
          />
        )}
      </Container>

      {recommendations.ok && recommendations.data.length > 0 ? (
        <Container className="pt-12 sm:pt-16">
          <section className="border-t border-line pt-8">
            <SectionHeading
              eyebrow="Need a starting point"
              title="Fresh gift ideas"
              description="Browse the latest gifts from independent shops while you choose a moment."
            />
            <ProductRail products={recommendations.data} />
          </section>
        </Container>
      ) : null}
    </div>
  );
}
