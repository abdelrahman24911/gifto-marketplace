import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartButton } from "@/components/add-to-cart-button";
import { ProductImage } from "@/components/product-image";
import { formatEgp } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Product — Gifto" };

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("public_vendors")
    .select("id, name, slug, is_accepting_orders")
    .eq("slug", slug)
    .maybeSingle();

  if (!shop) notFound();

  // Scoped to the shop in the URL, so a product slug cannot be reached through
  // a different shop's address. RLS additionally limits this to active products.
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, name, slug, description, price_minor, stock, status, category:categories(name, slug), product_images(path, alt, position)",
    )
    .eq("vendor_id", shop.id)
    .eq("slug", productSlug)
    .eq("status", "active")
    .maybeSingle();

  if (!product) notFound();

  const images = [...(product.product_images ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const category = Array.isArray(product.category)
    ? product.category[0]
    : product.category;
  const soldOut = product.stock <= 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
        <Link href="/shops" className="underline hover:text-zinc-800">
          Shops
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/shops/${shop.slug}`} className="underline hover:text-zinc-800">
          {shop.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-800">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          {images.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {images.map((image, index) => (
                <li key={image.path}>
                  <ProductImage
                    path={image.path}
                    alt={image.alt ?? `${product.name} ${index + 1}`}
                    name={product.name}
                    className="h-64 w-full"
                    sizes="(min-width: 768px) 448px, 100vw"
                    preload={index === 0}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ProductImage
              path={null}
              alt={product.name}
              name={product.name}
              className="h-64 w-full"
            />
          )}
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {product.name}
          </h1>

          <p className="mt-3 text-2xl font-semibold text-zinc-900">
            {formatEgp(product.price_minor)}
          </p>

          <p className="mt-2 text-sm">
            {soldOut ? (
              <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 font-medium text-zinc-600">
                Sold out
              </span>
            ) : (
              <span className="text-zinc-600">
                {product.stock} in stock · delivered by the shop
              </span>
            )}
          </p>

          {category ? (
            <p className="mt-4 text-sm text-zinc-500">
              Category:{" "}
              <Link
                href={`/categories/${category.slug}`}
                className="underline hover:text-zinc-800"
              >
                {category.name}
              </Link>
            </p>
          ) : null}

          {product.description ? (
            <p className="mt-5 whitespace-pre-line text-zinc-700">
              {product.description}
            </p>
          ) : null}

          <div className="mt-6">
            {shop.is_accepting_orders ? (
              <AddToCartButton
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
            ) : (
              <p
                role="status"
                className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {shop.name} has paused new orders. Browse the shop and come back
                when checkout reopens.
              </p>
            )}
            <p className="mt-3 text-sm text-zinc-500">
              Cash on delivery. Each shop delivers its own items, so an order
              with several shops arrives in separate deliveries.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
