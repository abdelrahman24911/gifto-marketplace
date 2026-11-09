import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { ProductImage } from "@/components/product-image";
import { formatEgp } from "@/lib/money";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";
import { requireVendorRole } from "@/lib/vendor";

import type { ProductStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage products — Gifto" };

function productsHref(vendorId: string, page = 1) {
  const params = new URLSearchParams({ vendor: vendorId });
  if (page > 1) params.set("page", String(page));
  return `/vendor/products?${params.toString()}`;
}

const statusStyles: Record<ProductStatus, string> = {
  draft: "bg-amber-50 text-amber-800 border-amber-200",
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  archived: "bg-paper-deep text-ink-soft border-line-strong",
};

const LOW_STOCK_THRESHOLD = 5;

export default async function VendorProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; page?: string }>;
}) {
  const { vendor, page: pageParam } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  const { data: products, count, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, status, price_minor, stock, category:categories(name, slug), product_images(path, alt, position)",
      { count: "exact" },
    )
    .eq("vendor_id", access.vendorId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(range.from, range.to);

  // A stale link past the last page lands on the last real page.
  if (requestedPage > 1 && (error || (products ?? []).length === 0)) {
    let total = count;
    if (total === null) {
      const head = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", access.vendorId);
      total = head.count ?? 0;
    }
    const lastPage = clampPage(requestedPage, total);
    if (lastPage !== requestedPage) {
      redirect(productsHref(access.vendorId, lastPage));
    }
  }

  const rows = products ?? [];
  const total = count ?? rows.length;
  const currentPage = clampPage(requestedPage, total);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Products</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Your role: {access.role} · shop status: {access.vendorStatus}
          </p>
        </div>
        {canManage ? (
          <Link
            href={`/vendor/products/new?vendor=${access.vendorId}`}
            className="rounded-full bg-berry px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-berry-deep"
          >
            Add product
          </Link>
        ) : null}
      </div>

      {!canManage ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You are a staff member of this shop, so products are read-only for
          you. An owner or manager can make changes.
        </p>
      ) : null}

      <section className="mt-8">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-10 text-center text-sm text-ink-soft">
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
                  className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-paper-soft p-4"
                >
                  <ProductImage
                    path={images[0]?.path ?? null}
                    alt={images[0]?.alt ?? product.name}
                    name={product.name}
                    className="h-16 w-16"
                    sizes="64px"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {product.name}
                    </p>
                    <p className="truncate text-sm text-ink-mute">
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
                        className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-paper-deep"
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
        <Pagination
          page={currentPage}
          total={total}
          pageSize={DEFAULT_PAGE_SIZE}
          label="Products pages"
          buildHref={(page) => productsHref(access.vendorId, page)}
        />
      </section>
    </div>
  );
}
