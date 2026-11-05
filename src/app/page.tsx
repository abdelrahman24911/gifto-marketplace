import Link from "next/link";

import { CategoryTile } from "@/components/category-tile";
import {
  BanknoteIcon,
  ShieldIcon,
  TagIcon,
  TruckIcon,
} from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import { ShopCard } from "@/components/shop-card";
import { Container, EmptyState, Eyebrow, SectionHeading } from "@/components/ui/section";
import {
  getCategories,
  getNewArrivals,
  getProductsByBudget,
  getShops,
  type CatalogProduct,
} from "@/lib/catalog";

export const metadata = {
  title: "Gifts in Egypt, wrapped properly",
  description:
    "Discover gifts from independent Egyptian gift shops — browse by occasion, by shop, or by budget, and pay cash on delivery.",
};

const BUDGET_BANDS = [
  { label: "Under EGP 250", min: null, max: 25_000, href: "/search?max=250" },
  {
    label: "EGP 250 – 500",
    min: 25_000,
    max: 50_000,
    href: "/search?min=250&max=500",
  },
  { label: "EGP 500 and up", min: 50_000, max: null, href: "/search?min=500" },
];

const VALUES = [
  {
    icon: BanknoteIcon,
    title: "Cash on delivery",
    body: "Pay the courier in cash when your gift arrives — no card required.",
  },
  {
    icon: ShieldIcon,
    title: "Every shop reviewed",
    body: "Platform admins approve each shop before it can appear on Gifto.",
  },
  {
    icon: TruckIcon,
    title: "Delivered by each shop",
    body: "Shops wrap and deliver their own gifts, so you know who you bought from.",
  },
  {
    icon: TagIcon,
    title: "Prices confirmed at checkout",
    body: "Order totals are recalculated on our servers — never trusted from the browser.",
  },
];

function ProductRail({
  title,
  href,
  products,
}: {
  title: string;
  href: string;
  products: CatalogProduct[];
}) {
  return (
    <div className="mt-10 first:mt-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h3 className="font-display text-xl text-ink">{title}</h3>
        <Link
          href={href}
          className="text-sm font-medium text-berry hover:text-berry-deep"
        >
          See all
        </Link>
      </div>
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
    </div>
  );
}

export default async function HomePage() {
  const [categories, arrivals, shops, ...budgetBands] = await Promise.all([
    getCategories(),
    getNewArrivals(8),
    getShops(6),
    ...BUDGET_BANDS.map((band) =>
      getProductsByBudget(band.min, band.max, 4),
    ),
  ]);

  const rails = BUDGET_BANDS.map((band, index) => ({
    ...band,
    products: budgetBands[index] ?? [],
  })).filter((rail) => rail.products.length > 0);

  return (
    <div className="pb-4">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-berry-soft blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-gold-soft blur-3xl"
        />
        <Container className="relative grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="gifto-rise">
            <Eyebrow>Gifts in Egypt</Eyebrow>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.04] text-ink">
              Gifts in Egypt, <span className="text-berry">wrapped properly.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-soft">
              Discover gifts from independent Egyptian shops — browse by
              occasion, by shop, or by budget. Order in minutes and pay cash on
              delivery.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/categories"
                className="inline-flex h-12 items-center rounded-full bg-berry px-6 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
              >
                Shop by occasion
              </Link>
              <Link
                href="/shops"
                className="inline-flex h-12 items-center rounded-full border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:border-berry/40 hover:text-berry"
              >
                Browse shops
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-mute">
              <li>Free delivery at launch</li>
              <li>Cash on delivery</li>
              <li>Vetted local shops</li>
            </ul>
          </div>

          <div className="relative mx-auto hidden w-full max-w-sm lg:block">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2.5rem] border border-line bg-gradient-to-br from-berry via-berry to-berry-deep p-8 shadow-[0_40px_80px_-45px_oklch(0.33_0.13_12/0.7)]">
              <div
                aria-hidden
                className="absolute inset-y-0 left-1/2 w-9 -translate-x-1/2 bg-gradient-to-b from-gold-soft via-gold to-gold-soft"
              />
              <div
                aria-hidden
                className="absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 bg-gradient-to-r from-gold-soft via-gold to-gold-soft"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl bg-paper/95 px-5 py-4 text-center shadow-lg">
                  <p className="font-display text-lg text-ink">Gifto</p>
                  <p className="text-[0.68rem] uppercase tracking-[0.2em] text-berry">
                    For you
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute -left-5 top-10 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink shadow-md">
              Wrapped with care
            </div>
            <div className="absolute -right-5 bottom-12 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink shadow-md">
              Cash on delivery
            </div>
          </div>
        </Container>
      </section>

      {/* Shop by occasion */}
      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Find the moment"
            title="Shop by occasion"
            description="From birthdays to weddings, start with the moment you're celebrating."
            href="/categories"
            linkLabel="All categories"
          />
          {categories.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.slice(0, 6).map((category, index) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Occasions are on their way">
              Gifto categories appear here as soon as the platform team adds
              them.
            </EmptyState>
          )}
        </Container>
      </section>

      {/* New arrivals */}
      <section className="border-t border-line bg-paper-soft/60 py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Just added"
            title="New arrivals"
            description="The latest gifts published by shops across Egypt."
            href="/search"
            linkLabel="Browse all gifts"
          />
          {arrivals.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {arrivals.map((product) => (
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
          ) : (
            <EmptyState title="No gifts listed yet">
              As soon as shops publish their first products, they&apos;ll appear
              here.
            </EmptyState>
          )}
        </Container>
      </section>

      {/* Gift discovery by budget */}
      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="By budget"
            title="Find a gift by budget"
            description="Real gifts from every shop, filtered to what you'd like to spend."
          />

          <div className="flex flex-wrap gap-3">
            {BUDGET_BANDS.map((band) => (
              <Link
                key={band.href}
                href={band.href}
                className="rounded-full border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:text-berry"
              >
                {band.label}
              </Link>
            ))}
          </div>

          {rails.length > 0 ? (
            <div className="mt-10">
              {rails.map((rail) => (
                <ProductRail
                  key={rail.href}
                  title={rail.label}
                  href={rail.href}
                  products={rail.products}
                />
              ))}
            </div>
          ) : (
            <div className="mt-8">
              <EmptyState title="No gifts match these budgets yet">
                Use the filters above to explore, or check back as shops add new
                products.
              </EmptyState>
            </div>
          )}
        </Container>
      </section>

      {/* Featured shops */}
      <section className="border-t border-line py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Independent makers"
            title="Shops worth browsing"
            description="Every shop on Gifto is reviewed and approved by the platform team."
            href="/shops"
            linkLabel="All shops"
          />
          {shops.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shops.map((shop) => (
                <ShopCard key={shop.id} shop={shop} />
              ))}
            </div>
          ) : (
            <EmptyState title="No shops yet">
              Approved shops appear here as soon as they go live on Gifto.
            </EmptyState>
          )}
        </Container>
      </section>

      {/* Trust strip */}
      <section className="border-t border-line bg-paper-soft/60 py-16 sm:py-20">
        <Container>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((value) => (
              <div key={value.title}>
                <value.icon className="h-7 w-7 text-berry" />
                <h3 className="mt-4 font-display text-lg text-ink">
                  {value.title}
                </h3>
                <p className="mt-2 text-sm text-ink-soft">{value.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Closing CTA */}
      <section className="pt-16 sm:pt-20">
        <Container>
          <div className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-berry to-berry-deep px-8 py-12 text-center sm:px-12">
            <h2 className="font-display text-3xl leading-tight text-paper sm:text-4xl">
              Have something to gift? Start with a shop.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-berry-tint">
              Browse gifts by occasion or explore shops directly — then check out
              with cash on delivery.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/shops"
                className="inline-flex h-12 items-center rounded-full bg-paper px-6 text-sm font-semibold text-berry-deep transition-colors hover:bg-paper-soft"
              >
                Browse shops
              </Link>
              <Link
                href="/search"
                className="inline-flex h-12 items-center rounded-full border border-paper/40 px-6 text-sm font-semibold text-paper transition-colors hover:bg-paper/10"
              >
                Browse all gifts
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
