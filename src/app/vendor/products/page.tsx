import Link from "next/link";

import { ProductImage } from "@/components/product-image";
import { formatEgp } from "@/lib/money";
import { requireVendorRole } from "@/lib/vendor";

import type { ProductStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage products — Gifto" };

const statusStyles: Record<ProductStatus, string> = {
  draft: "bg-amber-50 text-amber-800 border-amber-200",
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  archived: "bg-zinc-100 text-zinc-600 border-zinc-300",
};

const LOW_STOCK_THRESHOLD = 5;

export default async function VendorProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access, shops, canManage } = await requireVendorRole(vendor);

  const { data: products } = await supabase
    .from("products")
    .select(
      "id, name, slug, status, price_minor, stock, category:categories(name, slug), product_images(path, alt, position)",
    )
    .eq("vendor_id", access.vendorId)
    .order("created_at", { ascending: false });

  const rows = products ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {access.vendorName}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Your role: {access.role} · shop status: {access.vendorStatus}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/vendor/overview?vendor=${access.vendorId}`}
              className="rounded-full border border-zinc-300 px-3 py-1 text-zinc-700 hover:bg-zinc-50"
            >
              Overview
            </Link>
            <Link
              href={`/vendor/orders?vendor=${access.vendorId}`}
              className="rounded-full border border-zinc-300 px-3 py-1 text-zinc-700 hover:bg-zinc-50"
            >
              Orders
            </Link>
            <Link
              href={`/vendor/products?vendor=${access.vendorId}`}
              className="rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1 text-white"
            >
              Products
            </Link>
          </nav>
          {canManage ? (
            <Link
              href={`/vendor/products/new?vendor=${access.vendorId}`}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Add product
            </Link>
          ) : null}
        </div>
      </div>

      {shops.length > 1 ? (
        <nav aria-label="Switch shop" className="mt-5 flex flex-wrap gap-2">
          {shops.map((shop) => (
            <Link
              key={shop.vendorId}
              href={`/vendor/products?vendor=${shop.vendorId}`}
              className={`rounded-full border px-3 py-1 text-sm ${
                shop.vendorId === access.vendorId
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {shop.vendorName}
            </Link>
          ))}
        </nav>
      ) : null}

      {!canManage ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are a staff member of this shop, so products are read-only for
          you. An owner or manager can make changes.
        </p>
      ) : null}

      <section className="mt-8">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
            No products yet.
            {canManage ? " Add your first product to start selling." : ""}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((product) => {
              const images = [...(product.product_images ?? [])].sort(
                (a, b) => a.position - b.position,
              );
              const category = Array.isArray(product.category)
                ? product.category[0]
                : product.category;

              return (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4"
                >
                  <ProductImage
                    path={images[0]?.path ?? null}
                    alt={images[0]?.alt ?? product.name}
                    name={product.name}
                    className="h-16 w-16"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-zinc-900">
                      {product.name}
                    </p>
                    <p className="truncate text-sm text-zinc-500">
                      {category ? `${category.name} · ` : ""}
                      {formatEgp(product.price_minor)} · stock {product.stock}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {product.status === "active" && product.stock <= LOW_STOCK_THRESHOLD ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        Low stock
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[product.status]}`}
                    >
                      {product.status}
                    </span>
                    {canManage ? (
                      <Link
                        href={`/vendor/products/${product.id}?vendor=${access.vendorId}`}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
                      >
                        Edit
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
