import Link from "next/link";
import { notFound } from "next/navigation";

import { requireVendorRole } from "@/lib/vendor";

import { AdjustStockForm } from "./adjust-stock-form";

export const metadata = { title: "Inventory — Gifto" };

const REASON_LABEL: Record<string, string> = {
  order_placed: "Order placed",
  order_cancelled: "Order cancelled",
  manual_adjustment: "Manual adjustment",
};

export default async function ProductInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { id } = await params;
  const { vendor } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  const { data: product } = await supabase
    .from("products")
    .select("id, name, slug, stock")
    .eq("id", id)
    .eq("vendor_id", access.vendorId)
    .maybeSingle();

  if (!product) notFound();

  const { data: movements } = await supabase
    .from("inventory_movements")
    .select("id, delta, reason, note, order_id, created_at")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const history = movements ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link
        href={`/vendor/products/${product.id}?vendor=${access.vendorId}`}
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Back to product
      </Link>

      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Inventory · {product.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Every change below is recorded against the product.
          </p>
        </div>
        <p className="text-right">
          <span className="block text-xs uppercase tracking-wide text-zinc-500">
            On hand
          </span>
          <span className="text-3xl font-semibold text-zinc-900">
            {product.stock}
          </span>
        </p>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Adjust stock
        </h2>
        {canManage ? (
          <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-5">
            <AdjustStockForm
              productId={product.id}
              vendorId={access.vendorId}
            />
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You are a staff member of this shop, so inventory is read-only for
            you. An owner or manager can adjust stock.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          History ({history.length})
        </h2>
        {history.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
            No stock movements yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            {history.map((movement) => (
              <li
                key={movement.id}
                className="flex items-start justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800">
                    {REASON_LABEL[movement.reason] ?? movement.reason}
                    {movement.order_id ? (
                      <span className="font-normal text-zinc-500">
                        {" "}
                        · order #{movement.order_id.slice(0, 8)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(movement.created_at).toLocaleString("en-GB", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {movement.note ? ` · ${movement.note}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-medium ${
                    movement.delta >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {movement.delta >= 0 ? `+${movement.delta}` : movement.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
