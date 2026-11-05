import Link from "next/link";

import { requireVendorRole } from "@/lib/vendor";

export const metadata = { title: "Inventory — Gifto" };

const LOW_STOCK_THRESHOLD = 5;

export default async function VendorInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, status, stock")
    .eq("vendor_id", access.vendorId)
    .order("stock", { ascending: true })
    .order("name", { ascending: true });

  const rows = products ?? [];
  const lowStockCount = rows.filter(
    (product) =>
      product.status === "active" && product.stock <= LOW_STOCK_THRESHOLD,
  ).length;

  return (
    <div className="w-full">
      <div>
        <h1 className="font-display text-2xl text-ink">Inventory</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Stock is adjusted per product. {lowStockCount} active{" "}
          {lowStockCount === 1 ? "product is" : "products are"} at or below{" "}
          {LOW_STOCK_THRESHOLD}.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Inventory could not be loaded. Refresh the page to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-10 text-center text-sm text-ink-soft">
          No products yet. Add a product before adjusting inventory.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
          {rows.map((product) => {
            const low =
              product.status === "active" &&
              product.stock <= LOW_STOCK_THRESHOLD;
            return (
              <li
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {product.name}
                  </p>
                  <p className="text-xs text-ink-mute">{product.status}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      low
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-line bg-paper text-ink-soft"
                    }`}
                  >
                    Stock: {product.stock}
                  </span>
                  {canManage ? (
                    <Link
                      href={`/vendor/products/${product.id}/inventory?vendor=${access.vendorId}`}
                      className="text-sm font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
                    >
                      Adjust
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
