import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import {
  INVENTORY_SORTS,
  inventorySortLabel,
  parseInventorySort,
} from "@/lib/inventory";

import type { InventorySort } from "@/lib/inventory";
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

export const metadata = { title: "Inventory — Gifto" };

const LOW_STOCK_THRESHOLD = 5;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
] as const;

const STATUS_STYLES: Record<ProductStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  draft: "border-amber-200 bg-amber-50 text-amber-800",
  archived: "border-line-strong bg-paper-deep text-ink-soft",
};

function inventoryHref(
  vendorId: string,
  filter = "all",
  page = 1,
  query = "",
  sort: InventorySort = "low",
) {
  const params = new URLSearchParams({ vendor: vendorId });
  if (filter !== "all") params.set("status", filter);
  if (query) params.set("q", query);
  if (sort !== "low") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  return `/vendor/inventory?${params.toString()}`;
}

export default async function VendorInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    vendor?: string;
    status?: string;
    page?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const {
    vendor,
    status: filterParam,
    page: pageParam,
    q: query,
    sort: sortParam,
  } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const filter = filterParam === "low" || filterParam === "out" ? filterParam : "all";
  const sort = parseInventorySort(sortParam);
  const search = (query ?? "").trim().slice(0, 80);
  const searchTerm = search.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  let listQuery = supabase
    .from("products")
    .select("id, name, status, stock, created_at", { count: "exact" })
    .eq("vendor_id", access.vendorId);

  if (filter === "low") {
    listQuery = listQuery
      .eq("status", "active")
      .lte("stock", LOW_STOCK_THRESHOLD);
  } else if (filter === "out") {
    listQuery = listQuery.eq("status", "active").lte("stock", 0);
  }

  if (searchTerm) {
    listQuery = listQuery.ilike("name", `%${searchTerm}%`);
  }

  // The default order is lowest stock first so what needs restocking is on
  // top; the sort control makes that explicit and changeable.
  if (sort === "high") {
    listQuery = listQuery
      .order("stock", { ascending: false })
      .order("name", { ascending: true })
      .order("id", { ascending: true });
  } else if (sort === "name") {
    listQuery = listQuery
      .order("name", { ascending: true })
      .order("id", { ascending: true });
  } else if (sort === "newest") {
    listQuery = listQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
  } else {
    listQuery = listQuery
      .order("stock", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true });
  }

  const countProducts = (status?: ProductStatus) => {
    let count = supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", access.vendorId);
    if (status) count = count.eq("status", status);
    return count;
  };

  const [
    listResult,
    totalCountResult,
    activeCountResult,
    lowCountResult,
    outCountResult,
  ] = await Promise.all([
    listQuery.range(range.from, range.to),
    countProducts(),
    countProducts("active"),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", access.vendorId)
      .eq("status", "active")
      .lte("stock", LOW_STOCK_THRESHOLD),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", access.vendorId)
      .eq("status", "active")
      .lte("stock", 0),
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
      redirect(inventoryHref(access.vendorId, filter, lastPage, search, sort));
    }
  }

  const rows = listResult.data ?? [];
  const total = listResult.count ?? rows.length;
  const currentPage = clampPage(requestedPage, total);
  const countsFailed = Boolean(
    totalCountResult.error ||
      activeCountResult.error ||
      lowCountResult.error ||
      outCountResult.error,
  );

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Stock control"
        title="Inventory"
        description={
          <>
            Every stock change is audited. Adjustments use the shop-safe stock
            function, so product rows are never written by hand.
          </>
        }
        actions={
          <Link
            href={`/vendor/products?vendor=${access.vendorId}`}
            className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
          >
            Manage products
          </Link>
        }
      />

      {!canManage ? (
        <div className="mt-4">
          <VendorNotice tone="info">
            Staff access is read-only for inventory. Owners and managers can
            adjust stock.
          </VendorNotice>
        </div>
      ) : null}

      <div className="mt-6">
        <VendorStatStrip
          items={[
            {
              label: "Products",
              value: totalCountResult.error
                ? "—"
                : (totalCountResult.count ?? 0),
              hint: "All catalog statuses",
            },
            {
              label: "Active",
              value: activeCountResult.error
                ? "—"
                : (activeCountResult.count ?? 0),
              hint: "Sellable right now",
              emphasis: "positive",
            },
            {
              label: "Low stock",
              value: lowCountResult.error ? "—" : (lowCountResult.count ?? 0),
              hint: `Active at ${LOW_STOCK_THRESHOLD} or fewer`,
              emphasis: (lowCountResult.count ?? 0) > 0 ? "warning" : "default",
            },
            {
              label: "Out of stock",
              value: outCountResult.error ? "—" : (outCountResult.count ?? 0),
              hint: "Active with zero units",
              emphasis: (outCountResult.count ?? 0) > 0 ? "accent" : "default",
            },
          ]}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="Filter inventory" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <VendorFilterPill
              key={option.value}
              href={inventoryHref(
                access.vendorId,
                option.value,
                1,
                search,
                sort,
              )}
              active={filter === option.value}
            >
              {option.label}
            </VendorFilterPill>
          ))}
        </nav>

        <form
          action="/vendor/inventory"
          method="get"
          className="flex w-full max-w-md items-center gap-2"
        >
          <input type="hidden" name="vendor" value={access.vendorId} />
          {filter !== "all" ? (
            <input type="hidden" name="status" value={filter} />
          ) : null}
          {sort !== "low" ? (
            <input type="hidden" name="sort" value={sort} />
          ) : null}
          <label htmlFor="inventory-search" className="sr-only">
            Search inventory
          </label>
          <input
            id="inventory-search"
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
              href={inventoryHref(access.vendorId, filter, 1, "", sort)}
              className="shrink-0 text-sm font-medium text-ink-soft hover:text-berry"
            >
              Clear
            </Link>
          ) : null}
        </form>

        <form
          action="/vendor/inventory"
          method="get"
          className="flex items-center gap-2"
        >
          <input type="hidden" name="vendor" value={access.vendorId} />
          {filter !== "all" ? (
            <input type="hidden" name="status" value={filter} />
          ) : null}
          {search ? (
            <input type="hidden" name="q" value={search} />
          ) : null}
          <label
            htmlFor="inventory-sort"
            className="shrink-0 text-sm font-medium text-ink-soft"
          >
            Sort by
          </label>
          <select
            id="inventory-sort"
            name="sort"
            defaultValue={sort}
            className="rounded-full border border-line-strong bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/20"
          >
            {INVENTORY_SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-wine-deep"
          >
            Apply
          </button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-mute">
        <p>
          {total.toLocaleString("en-GB")}{" "}
          {total === 1 ? "product" : "products"}
          {searchTerm ? ` · matching “${search}”` : ""}
        </p>
        <p>
          {countsFailed
            ? "Stock counts are partial"
            : `Sorted: ${inventorySortLabel(sort)} · Low-stock threshold: ${LOW_STOCK_THRESHOLD}`}
        </p>
      </div>

      <section className="mt-5">
        {rows.length === 0 ? (
          <VendorEmpty
            title={
              searchTerm
                ? "No matching products"
                : filter === "low"
                  ? "No low-stock products"
                  : filter === "out"
                    ? "Nothing is out of stock"
                    : "No products yet"
            }
            action={
              searchTerm ? (
                <Link
                  href={inventoryHref(access.vendorId, filter, 1, "", sort)}
                  className="text-sm font-medium text-berry hover:text-berry-deep"
                >
                  Clear search
                </Link>
              ) : null
            }
          >
            {searchTerm
              ? "Try a shorter product name or switch the stock filter."
              : filter === "low"
                ? `Every active product has more than ${LOW_STOCK_THRESHOLD} units.`
                : filter === "out"
                  ? "All active products have stock available."
                  : "Add a product before adjusting inventory."}
          </VendorEmpty>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {rows.map((product) => {
              const low =
                product.status === "active" &&
                product.stock <= LOW_STOCK_THRESHOLD;
              return (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {product.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                      <span
                        className={`rounded-full border px-2 py-0.5 font-medium uppercase tracking-wide ${STATUS_STYLES[product.status]}`}
                      >
                        {product.status}
                      </span>
                      {low ? (
                        <span className="text-amber-800">
                          {product.stock <= 0
                            ? "Needs restock now"
                            : "Below reorder point"}
                        </span>
                      ) : (
                        <span>Stock is healthy</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p
                        className={`font-display text-2xl leading-none tabular-nums ${
                          product.stock <= 0 && product.status === "active"
                            ? "text-danger"
                            : low
                              ? "text-amber-800"
                              : "text-ink"
                        }`}
                      >
                        {product.stock}
                      </p>
                      <p className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-ink-mute">
                        on hand
                      </p>
                    </div>
                    {canManage ? (
                      <Link
                        href={`/vendor/products/${product.id}/inventory?vendor=${access.vendorId}`}
                        className="rounded-full border border-line-strong bg-paper px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft hover:text-berry-deep"
                      >
                        Adjust
                      </Link>
                    ) : (
                      <Link
                        href={`/vendor/products/${product.id}?vendor=${access.vendorId}`}
                        className="text-sm font-medium text-berry hover:text-berry-deep"
                      >
                        View
                      </Link>
                    )}
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
          label="Inventory pages"
          buildHref={(page) =>
            inventoryHref(access.vendorId, filter, page, search, sort)
          }
        />
      </section>
    </div>
  );
}
