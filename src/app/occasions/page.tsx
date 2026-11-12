import Link from "next/link";

import { OccasionTile } from "@/components/occasion-tile";
import { Container, EmptyState, Eyebrow } from "@/components/ui/section";
import { loadOccasions } from "@/lib/catalog";

export const metadata = {
  title: "Shop by occasion",
  description:
    "Browse gifts by the moment you're celebrating — birthdays, weddings, graduations and more.",
};

export default async function OccasionsPage() {
  const result = await loadOccasions();

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Eyebrow>Browse</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            Shop by occasion
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Start with the moment you&apos;re celebrating. Each occasion is
            curated by the Gifto team across every shop.
          </p>
        </Container>
      </section>

      <Container className="pt-10">
        {!result.ok ? (
          <EmptyState title="We couldn't load occasions">
            Something went wrong while loading occasions. Please try again in a
            moment, or{" "}
            <Link href="/shops" className="text-berry hover:underline">
              browse shops instead
            </Link>
            .
          </EmptyState>
        ) : result.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.map((occasion) => (
              <OccasionTile key={occasion.id} occasion={occasion} />
            ))}
          </div>
        ) : (
          <EmptyState title="Occasions are on their way">
            Gifto occasions are curated by the platform team and appear here as
            soon as they&apos;re published. In the meantime you can{" "}
            <Link href="/categories" className="text-berry hover:underline">
              browse categories
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
