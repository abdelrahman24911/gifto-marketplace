import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  BanknoteIcon,
  ShieldIcon,
  TagIcon,
  TruckIcon,
} from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import { ProductDetails } from "@/components/product-details";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { ShopLogo } from "@/components/shop-logo";
import {
  Breadcrumb,
  Container,
  Eyebrow,
} from "@/components/ui/section";
import { loadProductsByShop } from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";
import { formatEgp } from "@/lib/money";
import { productJsonLd, serializeJsonLd } from "@/lib/product-json-ld";
import {
  createClient,
} from "@/lib/supabase/server";
import {
  PRODUCT_IMAGES_BUCKET,
  type Json,
} from "@/lib/supabase/database.types";
import {
  formatPrepTime,
  formatWorkingHours,
  workingHoursFromJson,
} from "@/lib/vendor-settings";

type Props = {
  params: Promise<{ slug: string; productSlug: string }>;
};

type ShopRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_path: string | null;
  city: string | null;
  governorate: string | null;
  working_hours: Json;
  prep_time_min_days: number | null;
  prep_time_max_days: number | null;
  is_accepting_orders: boolean;
};

type ImageRow = { path: string; alt: string | null; position: number };
type CategoryRow = { name: string; slug: string };

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_minor: number;
  stock: number;
  category: CategoryRow | CategoryRow[] | null;
  product_images: ImageRow[] | null;
};

type ProductPageData = {
  shop: ShopRow;
  product: ProductRow;
  images: ImageRow[];
  category: CategoryRow | null;
};

const getProductPageData = cache(
  async (shopSlug: string, productSlug: string): Promise<ProductPageData | null> => {
    const supabase = await createClient();

    const { data: shop } = await supabase
      .from("public_vendors")
      .select(
        "id, name, slug, description, logo_path, city, governorate, working_hours, prep_time_min_days, prep_time_max_days, is_accepting_orders",
      )
      .eq("slug", shopSlug)
      .maybeSingle<ShopRow>();

    if (!shop) return null;

    // Scoped to the shop in the URL, so a product slug cannot be reached
    // through a different shop's address. RLS additionally limits this to
    // active products of active shops.
    const { data: product } = await supabase
      .from("products")
      .select(
        "id, name, slug, description, price_minor, stock, category:categories(name, slug), product_images(path, alt, position)",
      )
      .eq("vendor_id", shop.id)
      .eq("slug", productSlug)
      .eq("status", "active")
      .maybeSingle<ProductRow>();

    if (!product) return null;

    const images = [...(product.product_images ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    const category = Array.isArray(product.category)
      ? (product.category[0] ?? null)
      : product.category;

    return { shop, product, images, category };
  },
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const data = await getProductPageData(slug, productSlug);

  if (!data) notFound();

  const description = data.product.description
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return pageMetadata({
    title: data.product.name,
    description:
      description ||
      `Buy ${data.product.name} from ${data.shop.name} on Gifto.`,
    path: `/shops/${encodeURIComponent(data.shop.slug)}/${encodeURIComponent(data.product.slug)}`,
  });
}

const TRUST_ITEMS = [
  {
    icon: BanknoteIcon,
    title: "Cash on delivery",
    body: "Pay the courier in cash when it arrives.",
  },
  {
    icon: ShieldIcon,
    title: "Reviewed shop",
    body: "Approved by the Gifto team before going live.",
  },
  {
    icon: TruckIcon,
    title: "Delivered by the shop",
    body: "Each shop wraps and delivers its own gifts.",
  },
  {
    icon: TagIcon,
    title: "Prices confirmed at checkout",
    body: "Totals are recalculated on our servers.",
  },
];

function StockBadge({
  stock,
  soldOut,
  paused,
}: {
  stock: number;
  soldOut: boolean;
  paused: boolean;
}) {
  if (soldOut) {
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-paper-deep px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Sold out
      </span>
    );
  }

  if (paused) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
        Orders paused
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-deep/70 px-3 py-1 text-xs font-medium text-ink-soft">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-berry" />
      {stock} available
    </span>
  );
}

function TrustPanel() {
  return (
    <div className="mt-6 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
      {TRUST_ITEMS.map((item) => (
        <div key={item.title} className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-berry-soft text-berry">
            <item.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">{item.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-mute">
              {item.body}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ShopInfoCard({
  shop,
  location,
  prepTime,
  workingHours,
}: {
  shop: ShopRow;
  location: string;
  prepTime: string | null;
  workingHours: Array<{ day: string; label: string; value: string }>;
}) {
  return (
    <section
      aria-labelledby="shop-info-heading"
      className="rounded-3xl border border-line bg-paper-soft p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ShopLogo
            name={shop.name}
            path={shop.logo_path}
            className="h-12 w-12 rounded-xl text-xl"
          />
          <div className="min-w-0">
            <Eyebrow>Shop</Eyebrow>
            <h2
              id="shop-info-heading"
              className="mt-1 truncate font-display text-xl text-ink"
            >
              {shop.name}
            </h2>
            {location ? (
              <p className="truncate text-sm text-ink-mute">{location}</p>
            ) : null}
          </div>
        </div>

        <Link
          href={`/shops/${shop.slug}`}
          className="shrink-0 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-berry transition-colors hover:border-berry/35 hover:bg-berry-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
        >
          Visit shop
        </Link>
      </div>

      {shop.description ? (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-ink-soft">
          {shop.description}
        </p>
      ) : null}

      {prepTime || workingHours.length > 0 ? (
        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          {prepTime ? (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                Preparation
              </p>
              <p className="mt-1.5 text-sm font-medium text-ink">{prepTime}</p>
            </div>
          ) : null}

          {workingHours.length > 0 ? (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                Opening hours
              </p>
              <dl className="mt-1.5 grid gap-1">
                {workingHours.map((day) => (
                  <div
                    key={day.day}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <dt className="text-ink-soft">{day.label}</dt>
                    <dd className="font-medium text-ink">{day.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}

      {!shop.is_accepting_orders ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          This shop has paused new orders. Checkout will reopen when the shop
          resumes.
        </p>
      ) : null}
    </section>
  );
}

function DeliveryDetails({
  shopName,
  prepTime,
  workingHours,
}: {
  shopName: string;
  prepTime: string | null;
  workingHours: Array<{ day: string; label: string; value: string }>;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-ink">Delivery</h3>
        <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-ink-soft">
          <li>Delivered by {shopName} — each shop wraps and delivers its own gifts.</li>
          {prepTime ? <li>Preparation time: {prepTime}.</li> : null}
          <li>Free delivery at launch.</li>
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ink">Payment</h3>
        <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-ink-soft">
          <li>Cash on delivery.</li>
          <li>Prices and stock are confirmed by Gifto when you place the order.</li>
        </ul>
      </div>

      {workingHours.length > 0 ? (
        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold text-ink">Shop opening hours</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {workingHours.map((day) => (
              <div
                key={day.day}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <dt className="text-ink-soft">{day.label}</dt>
                <dd className="font-medium text-ink">{day.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug, productSlug } = await params;
  const data = await getProductPageData(slug, productSlug);

  if (!data) notFound();

  const { shop, product, images, category } = data;

  const relatedResult = await loadProductsByShop(shop.id, 12);
  const related = relatedResult.ok
    ? relatedResult.data
        .filter((item) => item.id !== product.id)
        .slice(0, 4)
    : [];

  const soldOut = product.stock <= 0;
  const purchasable = shop.is_accepting_orders && !soldOut;
  const location = [shop.city, shop.governorate].filter(Boolean).join(", ");
  const workingHours = formatWorkingHours(
    workingHoursFromJson(shop.working_hours),
  );
  const prepTime = formatPrepTime(
    shop.prep_time_min_days,
    shop.prep_time_max_days,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const imageUrls = supabaseUrl
    ? images.map(
        (image) =>
          `${supabaseUrl}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${image.path}`,
      )
    : [];
  const structuredData = productJsonLd({
    name: product.name,
    description: product.description,
    imageUrls,
    priceMinor: product.price_minor,
    stock: product.stock,
    shopName: shop.name,
    shopSlug: shop.slug,
    productSlug: product.slug,
  });

  const detailsTabs = [
    ...(product.description?.trim()
      ? [
          {
            id: "description",
            label: "Description",
            content: (
              <div className="max-w-3xl whitespace-pre-line break-words text-[0.95rem] leading-relaxed text-ink-soft">
                {product.description}
              </div>
            ),
          },
        ]
      : []),
    {
      id: "delivery",
      label: "Delivery & payment",
      content: (
        <DeliveryDetails
          shopName={shop.name}
          prepTime={prepTime}
          workingHours={workingHours}
        />
      ),
    },
  ];

  return (
    <div className={purchasable ? "pb-28 lg:pb-8" : "pb-8"}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Container className="py-8 sm:py-10 lg:py-12">
        <Breadcrumb
          items={[
            { href: "/", label: "Home" },
            { href: "/shops", label: "Shops" },
            { href: `/shops/${shop.slug}`, label: shop.name },
            ...(category
              ? [
                  {
                    href: `/categories/${category.slug}`,
                    label: category.name,
                  },
                ]
              : []),
            { label: product.name },
          ]}
        />

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-10">
          <ProductGallery
            key={product.id}
            images={images.map((image) => ({
              path: image.path,
              alt: image.alt,
            }))}
            name={product.name}
          />

          <div className="flex min-w-0 flex-col gap-5">
            <section className="rounded-3xl border border-line bg-paper-soft p-5 sm:p-6 lg:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/shops/${shop.slug}`}
                  className="group flex min-w-0 items-center gap-3 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-berry"
                >
                  <ShopLogo
                    name={shop.name}
                    path={shop.logo_path}
                    className="h-11 w-11 rounded-xl text-lg"
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                      Sold by
                    </span>
                    <span className="block truncate font-medium text-ink transition-colors group-hover:text-berry">
                      {shop.name}
                    </span>
                  </span>
                </Link>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-berry-tint bg-berry-soft px-3 py-1 text-xs font-semibold text-berry-deep">
                  <ShieldIcon className="h-3.5 w-3.5" />
                  Reviewed by Gifto
                </span>
              </div>

              {category ? (
                <Link
                  href={`/categories/${category.slug}`}
                  className="mt-5 inline-flex rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-berry/35 hover:text-berry"
                >
                  {category.name}
                </Link>
              ) : null}

              <h1 className="mt-4 break-words font-display text-3xl leading-[1.08] text-ink sm:text-4xl">
                {product.name}
              </h1>

              <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                <p className="font-display text-3xl leading-none text-ink">
                  {formatEgp(product.price_minor)}
                </p>
                <StockBadge
                  stock={product.stock}
                  soldOut={soldOut}
                  paused={!shop.is_accepting_orders}
                />
              </div>

              <p className="mt-2 text-sm text-ink-mute">
                Price confirmed by the shop when your order is placed.
              </p>

              <div className="mt-6 border-t border-line pt-6">
                <ProductPurchasePanel
                  key={product.id}
                  acceptingOrders={shop.is_accepting_orders}
                  item={{
                    productId: product.id,
                    vendorId: shop.id,
                    vendorName: shop.name,
                    vendorSlug: shop.slug,
                    name: product.name,
                    slug: product.slug,
                    priceMinor: product.price_minor,
                    imagePath: images[0]?.path ?? null,
                    stock: product.stock,
                  }}
                />
              </div>

              <TrustPanel />
            </section>

            <ShopInfoCard
              shop={shop}
              location={location}
              prepTime={prepTime}
              workingHours={workingHours}
            />
          </div>
        </div>

        <div className="mt-10 lg:mt-14">
          <ProductDetails tabs={detailsTabs} />
        </div>

        {related.length > 0 ? (
          <section
            aria-labelledby="more-from-shop"
            className="mt-10 border-t border-line pt-10 lg:mt-14"
          >
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Eyebrow>More from this shop</Eyebrow>
                <h2
                  id="more-from-shop"
                  className="mt-2 font-display text-2xl text-ink sm:text-3xl"
                >
                  More gifts from {shop.name}
                </h2>
              </div>
              <Link
                href={`/shops/${shop.slug}`}
                className="text-sm font-medium text-berry hover:text-berry-deep"
              >
                Visit shop
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard
                  key={item.id}
                  href={`/shops/${shop.slug}/${item.slug}`}
                  name={item.name}
                  priceMinor={item.priceMinor}
                  stock={item.stock}
                  imagePath={item.imagePath}
                  imageAlt={item.imageAlt}
                  categoryName={item.categoryName}
                />
              ))}
            </div>
          </section>
        ) : null}
      </Container>
    </div>
  );
}
