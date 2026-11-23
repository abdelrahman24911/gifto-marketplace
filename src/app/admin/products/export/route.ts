import { requirePlatformAdmin } from "@/lib/auth";
import { egpDecimal, toCsv } from "@/lib/csv";
import { fetchAllRows } from "@/lib/fetch-all";
import { parseProductSort, type ProductSort } from "@/lib/product-sort";

import type { ProductStatus } from "@/lib/supabase/database.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRODUCT_STATUSES: ProductStatus[] = ["draft", "active", "archived"];

const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

type ProductExportRow = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  stock: number;
  price_minor: number;
  created_at: string;
  vendor: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
};

function isProductStatus(value: string | null): value is ProductStatus {
  return value !== null && PRODUCT_STATUSES.some((status) => status === value);
}

/**
 * GET /admin/products/export?q=&status=&shop=&sort=
 *
 * Downloads the filtered product catalogue as CSV (all matching rows, not
 * just the visible page). The filters and sort are the same as
 * src/app/admin/products/page.tsx: the search strips LIKE pattern
 * characters before matching the name, an invalid shop or status falls
 * back to unfiltered, and an unknown sort falls back to newest first.
 * A catalogue larger than the read cap returns 422 so the export never
 * silently drops rows — narrow the filters instead.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { supabase } = await requirePlatformAdmin();

  // Same sanitisation as the products page (R-06): strip LIKE pattern
  // characters before the ilike search so a backslash cannot swallow the
  // following character.
  const query = (url.searchParams.get("q") ?? "")
    .replace(/[%_\\]/g, "")
    .trim()
    .slice(0, 80);
  const statusFilter = isProductStatus(url.searchParams.get("status"))
    ? (url.searchParams.get("status") as ProductStatus)
    : "all";
  const shopFilter =
    url.searchParams.get("shop") &&
    UUID_PATTERN.test(url.searchParams.get("shop") ?? "")
      ? (url.searchParams.get("shop") as string)
      : "";
  const sort: ProductSort = parseProductSort(
    url.searchParams.get("sort") ?? undefined,
  );

  const buildQuery = () => {
    let listQuery = supabase.from("products").select(
      "id, name, slug, status, stock, price_minor, created_at, vendor:vendors(name, slug), category:categories(name, slug)",
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
    return listQuery;
  };

  const result = await fetchAllRows<ProductExportRow>((from, to) =>
    buildQuery().range(from, to).returns<ProductExportRow[]>(),
  );

  if (result.failed) {
    return new Response("Product data could not be read. Try again.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (result.truncated) {
    return new Response(
      "Too many rows to export in one file. Filter by shop and try again.",
      {
        status: 422,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }

  const csv = toCsv(
    [
      "Product",
      "Slug",
      "Shop",
      "Category",
      "Status",
      "Price (EGP)",
      "Stock",
      "Created",
    ],
    result.rows.map((product) => [
      product.name,
      product.slug,
      product.vendor?.name ?? "Removed shop",
      product.category?.name ?? "",
      PRODUCT_STATUS_LABELS[product.status],
      egpDecimal(product.price_minor),
      product.stock,
      new Date(product.created_at).toISOString().slice(0, 10),
    ]),
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="gifto-products.csv"',
    },
  });
}
