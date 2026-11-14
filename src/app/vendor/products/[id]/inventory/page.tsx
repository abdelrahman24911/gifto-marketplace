import Link from "next/link";
import { notFound } from "next/navigation";

import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { requireVendorRole } from "@/lib/vendor";

import { VendorEmpty, VendorNotice, VendorPageHeader } from "../../../ui";
import { AdjustStockForm } from "./adjust-stock-form";

export const metadata = { title: "Inventory — Gifto" };

const LOW_STOCK_THRESHOLD = 5;

const REASON_LABEL: Record<string, string> = {
  order_placed: "Order placed",
  order_cancelled: "Order cancelled",
  manual_adjustment: "Manual adjustment",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

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
  const low = product.stock <= LOW_STOCK_THRESHOLD;

  return (
    <div className="w-full max-w-4xl">
      <Link
        href={`/vendor/products/${product.id}?vendor=${access.vendorId}`}
        className="text-sm font-medium text-ink-mute transition-colors hover:text-berry"
      >
        ← Back to product
      </Link>

      <div className="mt-4">
        <VendorPageHeader
          eyebrow="Inventory control"
          title={product.name}
          description="Adjust stock in whole units. Every change is recorded below against this product."
          actions={
            <Link
              href={`/vendor/products/${product.id}?vendor=${access.vendorId}`}
              className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
            >
              Edit listing
            </Link>
          }
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div
          className={`rounded-xl border px-4 py-4 ${
            product.stock <= 0
              ? "border-danger/25 bg-danger-soft"
              : low
                ? "border-warning/30 bg-warning-soft"
                : "border-line bg-paper-soft"
          }`}
        >
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            On hand
          </p>
          <p className="mt-1 font-display text-4xl leading-none tabular-nums text-ink">
            {product.stock}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {product.stock <= 0
              ? "Out of stock"
              : low
                ? `At or below ${LOW_STOCK_THRESHOLD}`
                : "Healthy level"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-paper-soft px-4 py-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            Movements loaded
          </p>
          <p className="mt-1 font-display text-4xl leading-none tabular-nums text-ink">
            {history.length}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Most recent {history.length === 100 ? "100" : "records"}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-paper-soft px-4 py-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            Your access
          </p>
          <p className="mt-1 font-display text-2xl capitalize leading-tight text-ink">
            {access.role}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {canManage ? "Can adjust stock" : "Read-only"}
          </p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-2xl text-ink">Adjust stock</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Use a negative number to remove units. Manual changes require a
          recorded reason in the audit trail.
        </p>
        {canManage ? (
          <div className="mt-4 rounded-2xl border border-line bg-paper-soft p-5">
            <AdjustStockForm
              productId={product.id}
              vendorId={access.vendorId}
            />
          </div>
        ) : (
          <div className="mt-4">
            <VendorNotice tone="info">
              Staff access is read-only. An owner or manager can adjust stock.
            </VendorNotice>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl text-ink">Movement history</h2>
            <p className="mt-1 text-xs text-ink-mute">
              Newest first · business time in Cairo
            </p>
          </div>
          <span className="rounded-full border border-line-strong bg-paper px-3 py-1 text-xs font-medium text-ink-soft">
            {history.length} shown
          </span>
        </div>

        {history.length === 0 ? (
          <div className="mt-4">
            <VendorEmpty title="No stock movements yet">
              Orders, cancellations and manual adjustments will be recorded
              here.
            </VendorEmpty>
          </div>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {history.map((movement) => (
              <li
                key={movement.id}
                className="flex items-start justify-between gap-4 border-b border-line px-4 py-4 last:border-b-0 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {REASON_LABEL[movement.reason] ?? movement.reason}
                    {movement.order_id ? (
                      <span className="font-normal text-ink-mute">
                        {" "}
                        · order #{movement.order_id.slice(0, 8)}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-ink-mute">
                    {formatDateTime(movement.created_at)}
                    {movement.note ? ` · ${movement.note}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-sm font-semibold tabular-nums ${
                    movement.delta >= 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
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
