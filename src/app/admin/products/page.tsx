import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { ProductImage } from "@/components/product-image";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatEgp } from "@/lib/money";
import {
  PRODUCT_SORTS,
  parseProductSort,
  productSortLabel,
} from "@/lib/product-sort";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";

import {
  AdminFilterPill,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../ui";

import type { ProductSort } from "@/lib/product-sort";
import type { ProductStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Products — Admin — Gifto" };

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  stock: number;
  price_minor: number;
  created_at: string;
  vendor: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
  product_images:
    | { path: string; alt: string | null; position: number }[]
    | null;
};

type VendorOption = {
  id: string;
  name: string;
};

const PRODUCT_STATUSES: ProductStatus[] = ["draft", "active", "archived"];

const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

const PRODUCT_STATUS_STYLES: Record<ProductStatus, string> = {
  draft: "border-warning/30 bg-warning-soft text-ink",
  active: "border-success/25 bg-success-soft text-ink",
  archived: "border-line-strong bg-paper text-ink-mute",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isProductStatus(value: string | undefined): value is ProductStatus {
  return PRODUCT_STATUSES.some((status) => status === value);
}

function productsHref({
  query,
  status,
  shop,
  page = 1,
  sort = "newest",
}: {
  query: string;
  status: ProductStatus | "all";
  shop: string;
  page?: number;
  sort?: ProductSort;
}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "all") params.set("status", status);
  if (shop) params.set("shop", shop);
  if (sort !== "newest") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/admin/products?${search}` : "/admin/products";
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    shop?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  // R-06: strip LIKE pattern characters before the ilike search, like the
  // orders, logistics, support and occasion-picker lists — a backslash is
  // Postgres LIKE's escape character, so leaving it in lets it swallow
  // the following character instead of matching literally.
  const query = (params.q ?? "")
    .replace(/[%_\\]/g, "")
    .trim()
    .slice(0, 80);
  const statusFilter = isProductStatus(params.status) ? params.status : "all";
  const shopFilter =
    params.shop && UUID_PATTERN.test(params.shop) ? params.shop : "";
  const sort = parseProductSort(params.sort);
  const requestedPage = parsePage(params.page);
  const range = pageWindow(requestedPage);

  let listQuery = supabase
    .from("products")
    .select(
      "id, name, slug, status, stock, price_minor, created_at, vendor:vendors(name, slug), category:categories(name, slug), product_images(path, alt, position)",
      { count: "exact" },
    );

  if (query) listQuery = listQuery.ilike("name", `%${query}%`);
  if (statusFilter !== "all") listQuery = listQuery.eq("status", statusFilter);
  if (shopFilter) listQuery = listQuery.eq("vendor_id", shopFilter);

  if (sort === "name") {
    listQuery = listQuery
      .order("name", { ascending: true })
      .order("id", { ascending: true });
  } else if (sort === "price-asc") {
    listQuery = listQuery
      .order("price_minor", { ascending: true })
      .order("id", { ascending: true });
  } else if (sort === "price-desc") {
    listQuery = listQuery
      .order("price_minor", { ascending: false })
      .order("id", { ascending: true });
  } else if (sort === "stock") {
    listQuery = listQuery
      .order("stock", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true });
  } else {
    listQuery = listQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  }

  const [
    listResult,
    vendorsResult,
    allCountResult,
    activeCountResult,
    lowStockResult,
    outOfStockResult,
  ] = await Promise.all([
    listQuery.range(range.from, range.to).returns<ProductRow[]>(),
    fetchAllRows<VendorOption>((from, to) =>
      supabase
        .from("vendors")
        .select("id, name")
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<VendorOption[]>(),
    ),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lte("stock", 5),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lte("stock", 0),
  ]);

  const total = listResult.count ?? 0;
  const currentPage = clampPage(requestedPage, total);

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(
      productsHref({
        query,
        status: statusFilter,
        shop: shopFilter,
        page: currentPage,
        sort,
      }),
    );
  }

  const products = listResult.data ?? [];
  const vendors = vendorsResult.rows;
  const filtersActive =
    Boolean(query) || statusFilter !== "all" || Boolean(shopFilter);
  const countValue = (
    result: { count: number | null; error: unknown },
  ) => (result.error ? "—" : (result.count ?? 0));

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Products" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Catalog oversight"
          title="Products"
          description="A read-only view of every gift listing across the marketplace. Use the shop and status filters to investigate catalog coverage; vendors remain responsible for their own listings."
        />
      </div>

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "All products",
              value: countValue(allCountResult),
              hint: "Across every shop",
              emphasis: "accent",
            },
            {
              label: "Active",
              value: countValue(activeCountResult),
              hint: "Visible to shoppers",
              emphasis: "positive",
            },
            {
              label: "Low stock",
              value: countValue(lowStockResult),
              hint: "Active, 5 units or fewer",
              emphasis:
                !lowStockResult.error && (lowStockResult.count ?? 0) > 0
                  ? "warning"
                  : "default",
            },
            {
              label: "Out of stock",
              value: countValue(outOfStockResult),
              hint: "Active, zero units",
            },
          ]}
        />
      </div>

      {vendorsResult.failed || vendorsResult.truncated ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="status">
            The shop filter list is incomplete, so some shops may not appear in
            the dropdown. Product results are unaffected.
          </AdminNotice>
        </div>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-col gap-4 border-b border-line pb-5">
          <div className="flex flex-wrap gap-2">
            <AdminFilterPill
              href={productsHref({
                query,
                status: "all",
                shop: shopFilter,
                sort,
              })}
              active={statusFilter === "all"}
            >
              All statuses
            </AdminFilterPill>
            {PRODUCT_STATUSES.map((status) => (
              <AdminFilterPill
                key={status}
                href={productsHref({ query, status, shop: shopFilter, sort })}
                active={statusFilter === status}
              >
                {PRODUCT_STATUS_LABELS[status]}
              </AdminFilterPill>
            ))}
          </div>

          <form
            method="get"
            action="/admin/products"
            className="flex flex-wrap items-end gap-2"
          >
            {statusFilter !== "all" ? (
              <input type="hidden" name="status" value={statusFilter} />
            ) : null}
            <label className="min-w-56 flex-1">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                Product name
              </span>
              <input
                type="search"
                name="q"
                defaultValue={query}
                maxLength={80}
                placeholder="Search the catalog"
                className="w-full rounded-full border border-line-strong bg-paper-soft px-4 py-2 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
              />
            </label>
            <label className="min-w-48">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                Shop
              </span>
              <select
                name="shop"
                defaultValue={shopFilter}
                className="w-full rounded-full border border-line-strong bg-paper-soft px-4 py-2 text-sm text-ink focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
              >
                <option value="">All shops</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-48">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                Sort by
              </span>
              <select
                name="sort"
                defaultValue={sort}
                className="w-full rounded-full border border-line-strong bg-paper-soft px-4 py-2 text-sm text-ink focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
              >
                {PRODUCT_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-wine-deep"
            >
              Apply
            </button>
            {filtersActive ? (
              <Link
                href="/admin/products"
                className="px-2 py-2 text-sm text-ink-mute hover:text-berry-deep"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs text-ink-mute">
            {total.toLocaleString("en-US")}{" "}
            {total === 1 ? "product" : "products"}
            {filtersActive ? " match these filters" : " in the marketplace"}
            {` · Sorted: ${productSortLabel(sort)}`}
          </p>
          <p className="text-xs text-ink-mute">
            Showing page {currentPage} of{" "}
            {Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE))}
          </p>
        </div>

        {listResult.error ? (
          <div className="mt-4">
            <AdminNotice tone="danger" role="alert">
              Products could not be loaded.
            </AdminNotice>
            <RefreshButton />
          </div>
        ) : products.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={filtersActive ? "No products match" : "No products yet"}
            >
              {filtersActive ? (
                <>
                  Clear or adjust the filters to see more of the catalog.
                </>
              ) : (
                <>
                  Products appear here as soon as shops add them to their
                  storefronts.
                </>
              )}
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {products.map((product) => {
              const images = [...(product.product_images ?? [])].sort(
                (a, b) => a.position - b.position,
              );
              const lowStock =
                product.status === "active" && product.stock <= 5;
              const outOfStock =
                product.status === "active" && product.stock <= 0;

              return (
                <li
                  key={product.id}
                  className="grid gap-4 border-b border-line px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="flex min-w-0 gap-3">
                    <ProductImage
                      path={images[0]?.path ?? null}
                      alt={images[0]?.alt ?? product.name}
                      name={product.name}
                      className="h-16 w-16 shrink-0"
                      sizes="64px"
                    />
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words text-base font-medium text-ink">
                        {product.name}
                      </h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${PRODUCT_STATUS_STYLES[product.status]}`}
                      >
                        {PRODUCT_STATUS_LABELS[product.status]}
                      </span>
                      {outOfStock ? (
                        <span className="rounded-full border border-danger/25 bg-danger-soft px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-ink">
                          Out of stock
                        </span>
                      ) : lowStock ? (
                        <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-ink">
                          Low stock
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-mute">
                      {product.category?.name ?? "Uncategorized"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <span className="text-ink-soft">
                        Shop{" "}
                        {product.vendor ? (
                          <Link
                            href={`/admin/shops?q=${encodeURIComponent(product.vendor.name)}`}
                            className="font-medium text-berry hover:underline"
                          >
                            {product.vendor.name}
                          </Link>
                        ) : (
                          <span className="text-ink-mute">Unknown</span>
                        )}
                      </span>
                      <span className="text-ink-soft">
                        Stock{" "}
                        <span className="font-medium tabular-nums text-ink">
                          {product.stock}
                        </span>
                      </span>
                    </div>
                    </div>
                  </div>

                  <div className="text-left lg:text-right">
                    <p className="font-display text-2xl tabular-nums text-ink">
                      {formatEgp(product.price_minor)}
                    </p>
                    <p className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                      Listed price
                    </p>
                  </div>

                  <div className="text-xs text-ink-mute lg:w-32 lg:text-right">
                    Added{" "}
                    {new Date(product.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: BUSINESS_TIME_ZONE,
                    })}
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
          label="Platform product pages"
          buildHref={(page) =>
            productsHref({
              query,
              status: statusFilter,
              shop: shopFilter,
              page,
              sort,
            })
          }
        />
      </section>
    </div>
  );
}
