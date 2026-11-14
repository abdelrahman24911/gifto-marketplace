import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductCard } from "@/components/product-card";
import { ShopCover } from "@/components/shop-cover";
import { ShopLogo } from "@/components/shop-logo";
import {
  Breadcrumb,
  Container,
  EmptyState,
  Eyebrow,
} from "@/components/ui/section";
import { loadProductsByShop, loadShop } from "@/lib/catalog";
import { formatPrepTime, formatWorkingHours } from "@/lib/vendor-settings";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadShop(slug);

  if (!result.ok || !result.data) {
    return { title: "Shop" };
  }

  const location = [result.data.city, result.data.governorate]
    .filter(Boolean)
    .join(", ");

  return {
    title: result.data.name,
    description:
      result.data.description ??
      `Gifts from ${result.data.name}${location ? ` in ${location}` : ""} on Gifto.`,
  };
}

export default async function ShopPage({ params }: Props) {
  const { slug } = await params;
  const shopResult = await loadShop(slug);

  if (!shopResult.ok) {
    return (
      <Container className="py-16">
        <EmptyState title="We couldn't load this shop">
          Something went wrong. Please{" "}
          <Link href="/shops" className="text-berry hover:underline">
            go back to shops
          </Link>{" "}
          or try again in a moment.
        </EmptyState>
      </Container>
    );
  }

  const shop = shopResult.data;
  if (!shop) notFound();

  const productsResult = await loadProductsByShop(shop.id);
  const products = productsResult.ok ? productsResult.data : [];
  const location = [shop.city, shop.governorate].filter(Boolean).join(", ");
  const workingHours = formatWorkingHours(shop.workingHours);
  const prepTime = formatPrepTime(
    shop.prepTimeMinDays,
    shop.prepTimeMaxDays,
  );

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-14">
          <Breadcrumb
            items={[
              { href: "/", label: "Home" },
              { href: "/shops", label: "Shops" },
              { label: shop.name },
            ]}
          />

          <div className="mt-5">
            <ShopCover path={shop.coverPath} name={shop.name} preload />
          </div>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start">
            <ShopLogo
              name={shop.name}
              path={shop.logoPath}
              className="h-16 w-16 rounded-2xl text-3xl"
            />
            <div className="max-w-2xl">
              <Eyebrow>Shop</Eyebrow>
              <h1 className="mt-2 font-display text-4xl leading-tight text-ink sm:text-5xl">
                {shop.name}
              </h1>
              {location ? (
                <p className="mt-2 text-ink-mute">{location}</p>
              ) : null}
              {shop.description ? (
                <p className="mt-4 text-lg text-ink-soft">{shop.description}</p>
              ) : null}
              {workingHours.length > 0 || prepTime ? (
                <div className="mt-5 grid gap-4 rounded-xl border border-line bg-paper px-4 py-3 sm:grid-cols-2">
                  {workingHours.length > 0 ? (
                    <div>
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                        Opening hours
                      </h2>
                      <dl className="mt-2 grid gap-1 text-sm">
                        {workingHours.map((day) => (
                          <div
                            key={day.day}
                            className="flex items-center justify-between gap-3"
                          >
                            <dt className="text-ink-soft">{day.label}</dt>
                            <dd className="font-medium text-ink">{day.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                  {prepTime ? (
                    <div>
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
                        Preparation time
                      </h2>
                      <p className="mt-2 text-sm font-medium text-ink">
                        {prepTime}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!shop.isAcceptingOrders ? (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                >
                  This shop has paused new orders. You can still browse the
                  gifts; checkout will reopen when the shop resumes.
                </p>
              ) : null}
            </div>
          </div>
        </Container>
      </section>

      <Container className="pt-10">
        <section aria-labelledby="shop-gifts">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="shop-gifts" className="font-display text-2xl text-ink">
              Gifts from {shop.name}
            </h2>
            {productsResult.ok ? (
              <p className="text-sm text-ink-mute">
                {products.length}{" "}
                {products.length === 1 ? "gift" : "gifts"}
              </p>
            ) : null}
          </div>

          {!productsResult.ok ? (
            <EmptyState title="We couldn't load this shop's gifts">
              The catalogue didn&apos;t respond.{" "}
              <Link
                href={`/shops/${shop.slug}`}
                className="text-berry hover:underline"
              >
                Try again
              </Link>
              .
            </EmptyState>
          ) : products.length === 0 ? (
            <EmptyState title="No gifts listed yet">
              {shop.name} hasn&apos;t published any gifts yet.{" "}
              <Link href="/shops" className="text-berry hover:underline">
                Browse other shops
              </Link>{" "}
              to keep looking.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  href={`/shops/${shop.slug}/${product.slug}`}
                  name={product.name}
                  priceMinor={product.priceMinor}
                  stock={product.stock}
                  imagePath={product.imagePath}
                  imageAlt={product.imageAlt}
                  categoryName={product.categoryName}
                />
              ))}
            </div>
          )}
        </section>

        <div className="mt-12 border-t border-line pt-6">
          <Link
            href="/shops"
            className="text-sm font-medium text-berry hover:text-berry-deep"
          >
            ← Back to all shops
          </Link>
        </div>
      </Container>
    </div>
  );
}
