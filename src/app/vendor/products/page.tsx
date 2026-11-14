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

import {
  VendorEmpty,
  VendorFilterPill,
  VendorNotice,
  VendorPageHeader,
  VendorStatStrip,
} from "../ui";

import type { ProductStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage products — Gifto" };

const LOW_STOCK_THRESHOLD = 5;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
  { value: "low", label: "Low stock" },
] as const;

const PRODUCT_STATUSES: ProductStatus[] = ["active", "draft", "archived"];

const statusStyles: Record<ProductStatus, string> = {
  draft: "bg-amber-50 text-amber-800 border-amber-200",
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  archived: "bg-paper-deep text-ink-soft border-line-strong",
};

type TagRow = {
  product_id: string;
  tag: { name: string } | { name: string }[] | null;
};

function productsHref(
  vendorId: string,
  filter = "all",
  page = 1,
  query = "",
) {
  const params = new URLSearchParams({ vendor: vendorId });
  if (filter !== "all") params.set("status", filter);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  return `/vendor/products?${params.toString()}`;
}

function isProductStatus(value: string): value is ProductStatus {
  return PRODUCT_STATUSES.includes(value as ProductStatus);
}

export default async function VendorProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    vendor?: string;
    page?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const {
    vendor,
    page: pageParam,
    status: statusParam,
    q: query,
  } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const filter = statusParam ?? "all";
  const search = (query ?? "").trim().slice(0, 80);
  const searchTerm = search.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  let listQuery = supabase
    .from("products")
    .select(
      "id, name, slug, status, price_minor, stock, category:categories(name, slug), product_images(path, alt, position)",
      { count: "exact" },
    )
    .eq("vendor_id", access.vendorId);

  if (filter === "low") {
    listQuery = listQuery
      .eq("status", "active")
      .lte("stock", LOW_STOCK_THRESHOLD);
  } else if (isProductStatus(filter)) {
    listQuery = listQuery.eq("status", filter);
  }

  if (searchTerm) {
    listQuery = listQuery.ilike("name", `%${searchTerm}%`);
  }

  const countQuery = (status?: ProductStatus) => {
    let count = supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", access.vendorId);
    if (status) count = count.eq("status", status);
    return count;
  };

  const [
    listResult,
    allCountResult,
    activeCountResult,
    draftCountResult,
    lowCountResult,
  ] = await Promise.all([
    listQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(range.from, range.to),
    countQuery(),
    countQuery("active"),
    countQuery("draft"),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", access.vendorId)
      .eq("status", "active")
      .lte("stock", LOW_STOCK_THRESHOLD),
  ]);

  if (
    requestedPage > 1 &&
    (listResult.error || (listResult.data ?? []).length === 0)
  ) {
    let total = listResult.count;
    if (total === null) {
      const head = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", access.vendorId);
      total = head.count ?? 0;
    }
    const lastPage = clampPage(requestedPage, total);
    if (lastPage !== requestedPage) {
      redirect(productsHref(access.vendorId, filter, lastPage, search));
    }
  }

  const rows = listResult.data ?? [];
  const total = listResult.count ?? rows.length;
  const currentPage = clampPage(requestedPage, total);

  const productIds = rows.map((product) => product.id);
  const { data: tagRows } = productIds.length
    ? await supabase
        .from("product_tags")
        .select("product_id, tag:tags(name)")
        .in("product_id", productIds)
        .returns<TagRow[]>()
    : { data: [] as TagRow[] };

  const tagsByProduct = new Map<string, string[]>();
  for (const row of tagRows ?? []) {
    const tag = Array.isArray(row.tag) ? row.tag[0] : row.tag;
    if (!tag) continue;
    const current = tagsByProduct.get(row.product_id) ?? [];
    current.push(tag.name);
    tagsByProduct.set(row.product_id, current);
  }

  const countsFailed = Boolean(
    allCountResult.error ||
      activeCountResult.error ||
      draftCountResult.error ||
      lowCountResult.error,
  );

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Catalog"
        title="Products"
        description={
          <>
            Your collection, pricing, photos and visibility. Each product lives
            in {access.vendorName} only.
          </>
        }
        actions={
          canManage ? (
            <Link
              href={`/vendor/products/new?vendor=${access.vendorId}`}
              className="rounded-full bg-berry px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
            >
              Add product
            </Link>
          ) : null
        }
      />

      {!canManage ? (
        <div className="mt-4">
          <VendorNotice tone="info">
            Staff access is read-only for products. Owners and managers can
            edit listings, pricing and visibility.
          </VendorNotice>
        </div>
      ) : null}

      <div className="mt-6">
        <VendorStatStrip
          items={[
            {
              label: "All products",
              value: allCountResult.error ? "—" : (allCountResult.count ?? 0),
              hint: "Including drafts and archives",
            },
            {
              label: "Active",
              value: activeCountResult.error
                ? "—"
                : (activeCountResult.count ?? 0),
              hint: "Visible on Gifto",
              emphasis: "positive",
            },
            {
              label: "Drafts",
              value: draftCountResult.error
                ? "—"
                : (draftCountResult.count ?? 0),
              hint: "Only your shop can see them",
              emphasis: (draftCountResult.count ?? 0) > 0 ? "warning" : "default",
            },
            {
              label: "Low stock",
              value: lowCountResult.error ? "—" : (lowCountResult.count ?? 0),
              hint: `Active at ${LOW_STOCK_THRESHOLD} units or fewer`,
              emphasis: (lowCountResult.count ?? 0) > 0 ? "accent" : "default",
            },
          ]}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="Filter products" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <VendorFilterPill
              key={option.value}
              href={productsHref(access.vendorId, option.value, 1, search)}
              active={filter === option.value}
            >
              {option.label}
            </VendorFilterPill>
          ))}
        </nav>

        <form
          action="/vendor/products"
          method="get"
          className="flex w-full max-w-md items-center gap-2"
        >
          <input type="hidden" name="vendor" value={access.vendorId} />
          {filter !== "all" ? (
            <input type="hidden" name="status" value={filter} />
          ) : null}
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>
          <input
            id="product-search"
            type="search"
            name="q"
            defaultValue={search}
            maxLength={80}
            placeholder="Search by product name"
            className="min-w-0 flex-1 rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/20"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-berry px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
          >
            Search
          </button>
          {search ? (
            <Link
              href={productsHref(access.vendorId, filter)}
              className="shrink-0 text-sm font-medium text-ink-soft hover:text-berry"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-mute">
        <p>
          {total.toLocaleString("en-GB")}{" "}
          {total === 1 ? "product" : "products"}
          {searchTerm ? ` · matching “${search}”` : ""}
        </p>
        <p>{countsFailed ? "Catalog counts are partial" : "All figures live"}</p>
      </div>

      <section className="mt-5">
        {rows.length === 0 ? (
          <VendorEmpty
            title={searchTerm ? "No products match" : "No products here yet"}
            action={
              searchTerm ? (
                <Link
                  href={productsHref(access.vendorId, filter)}
                  className="text-sm font-medium text-berry hover:text-berry-deep"
                >
                  Clear search
                </Link>
              ) : canManage ? (
                <Link
                  href={`/vendor/products/new?vendor=${access.vendorId}`}
                  className="text-sm font-medium text-berry hover:text-berry-deep"
                >
                  Add your first product
                </Link>
              ) : null
            }
          >
            {searchTerm
              ? "Try a shorter name or a different status filter."
              : filter !== "all"
                ? "Nothing in this view. Switch filters to see the rest of the catalog."
                : canManage
                  ? "Build the collection customers will browse on your shop page."
                  : "The shop has not added any products yet."}
          </VendorEmpty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((product) => {
              const images = [...(product.product_images ?? [])].sort(
                (a, b) => a.position - b.position,
              );
              const category = Array.isArray(product.category)
                ? product.category[0]
                : product.category;
              const tags = tagsByProduct.get(product.id) ?? [];
              const lowStock =
                product.status === "active" &&
                product.stock <= LOW_STOCK_THRESHOLD;

              return (
                <li
                  key={product.id}
                  className="group overflow-hidden rounded-2xl border border-line bg-paper-soft transition-colors hover:border-berry/25"
                >
                  <div className="relative">
                    <ProductImage
                      path={images[0]?.path ?? null}
                      alt={images[0]?.alt ?? product.name}
                      name={product.name}
                      className="h-44 w-full"
                      rounded="rounded-none"
                      sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw"
                    />
                    <span
                      className={`absolute left-3 top-3 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${statusStyles[product.status]}`}
                    >
                      {product.status}
                    </span>
                    {lowStock ? (
                      <span className="absolute right-3 top-3 rounded-full border border-rose/25 bg-rose-soft px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-berry-deep">
                        Low stock
                      </span>
                    ) : null}
                  </div>

                  <div className="p-4">
                    <p className="text-xs text-ink-mute">
                      {category?.name ?? "Uncategorised"}
                    </p>
                    <h2 className="mt-1 line-clamp-2 font-display text-xl leading-tight text-ink">
                      {product.name}
                    </h2>

                    {tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-line bg-paper px-2 py-0.5 text-[0.62rem] font-medium text-ink-soft"
                          >
                            {tag}
                          </span>
                        ))}
                        {tags.length > 3 ? (
                          <span className="text-[0.62rem] text-ink-mute">
                            +{tags.length - 3}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-[0.65rem] text-ink-mute">
                        No tags yet
                      </p>
                    )}

                    <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
                      <div>
                        <p className="font-display text-lg tabular-nums text-ink">
                          {formatEgp(product.price_minor)}
                        </p>
                        <p
                          className={`mt-1 text-xs ${
                            lowStock
                              ? "font-medium text-amber-800"
                              : "text-ink-mute"
                          }`}
                        >
                          {product.stock <= 0
                            ? "Out of stock"
                            : `${product.stock} in stock`}
                        </p>
                      </div>
                      {canManage ? (
                        <Link
                          href={`/vendor/products/${product.id}?vendor=${access.vendorId}`}
                          className="rounded-full border border-line-strong bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft hover:text-berry-deep"
                        >
                          Manage
                        </Link>
                      ) : null}
                    </div>
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
          buildHref={(page) =>
            productsHref(access.vendorId, filter, page, search)
          }
        />
      </section>
    </div>
  );
}
