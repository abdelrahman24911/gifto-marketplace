import type { Metadata } from "next";
import Link from "next/link";

import { ShopCard } from "@/components/shop-card";
import { Container, EmptyState, Eyebrow } from "@/components/ui/section";
import { loadShops } from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Shops",
  description:
    "Browse approved, independent gift shops across Egypt on Gifto. Order with cash on delivery.",
  path: "/shops",
});

export default async function ShopsPage() {
  const result = await loadShops();

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Eyebrow>Independent makers</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            Shops on Gifto
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            Every shop here is reviewed and approved by the platform team. Browse
            their gifts, then order with cash on delivery.
          </p>
        </Container>
      </section>

      <Container className="pt-10">
        {!result.ok ? (
          <EmptyState title="We couldn't load the shops">
            Something went wrong. Please{" "}
            <Link href="/shops" className="text-berry hover:underline">
              try again
            </Link>{" "}
            in a moment.
          </EmptyState>
        ) : result.data.length === 0 ? (
          <EmptyState title="No shops yet">
            Approved shops appear here as soon as they go live. In the meantime,
            you can{" "}
            <Link href="/search" className="text-berry hover:underline">
              search gifts
            </Link>
            .
          </EmptyState>
        ) : (
          <>
            <p className="mb-6 text-sm text-ink-mute">
              {result.data.length}{" "}
              {result.data.length === 1 ? "shop" : "shops"}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.map((shop) => (
                <ShopCard key={shop.id} shop={shop} />
              ))}
            </div>
          </>
        )}
      </Container>
    </div>
  );
}
