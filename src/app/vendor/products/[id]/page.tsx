import Link from "next/link";
import { notFound } from "next/navigation";

import { formatEgp, minorToEgpInput } from "@/lib/money";
import { requireVendorRole } from "@/lib/vendor";

import { VendorPageHeader } from "../../ui";
import { DeleteProductButton } from "../delete-product-button";
import { ProductForm } from "../product-form";
import { loadProductTagging } from "../tag-data";
import { ProductTagPanel } from "../tag-panel";
import { ProductImagesPanel } from "./images/product-images-panel";

import type { ProductStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Edit product — Gifto" };

const STATUS_STYLES: Record<ProductStatus, string> = {
  draft: "border-amber-200 bg-amber-50 text-amber-800",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  archived: "border-line-strong bg-paper-deep text-ink-soft",
};

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { id } = await params;
  const { vendor } = await searchParams;
  const { supabase, access, canManage, isPlatformAdmin } =
    await requireVendorRole(vendor);

  const [{ data: product }, { data: categories }, tagging] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, slug, description, price_minor, stock, status, category_id, product_images(path, alt, position)",
      )
      .eq("id", id)
      .eq("vendor_id", access.vendorId)
      .maybeSingle(),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
    loadProductTagging(supabase, id, access.vendorId),
  ]);

  if (!product) notFound();
  if (!tagging.ok) throw new Error(tagging.error);

  const images = [...(product.product_images ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <div className="w-full max-w-4xl">
      <Link
        href={`/vendor/products?vendor=${access.vendorId}`}
        className="text-sm font-medium text-ink-mute transition-colors hover:text-berry"
      >
        ← All products
      </Link>

      <div className="mt-4">
        <VendorPageHeader
          eyebrow={`Catalog · /${product.slug}`}
          title={product.name}
          description={
            canManage
              ? "Update the listing, photos and discovery tags customers will see."
              : "You have read-only access to this listing."
          }
          actions={
            <>
              <Link
                href={`/shops/${access.vendorSlug}/${product.slug}`}
                className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
              >
                View on shop
              </Link>
              <Link
                href={`/vendor/products/${product.id}/inventory?vendor=${access.vendorId}`}
                className="rounded-full bg-berry px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
              >
                Inventory · {product.stock}
              </Link>
            </>
          }
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            Price
          </p>
          <p className="mt-1 font-display text-xl tabular-nums text-ink">
            {formatEgp(product.price_minor)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            On hand
          </p>
          <p className="mt-1 font-display text-xl tabular-nums text-ink">
            {product.stock}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-paper-soft px-4 py-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
            Visibility
          </p>
          <p className="mt-1">
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[product.status]}`}
            >
              {product.status}
            </span>
          </p>
        </div>
      </div>

      <ProductImagesPanel
        productId={product.id}
        vendorId={access.vendorId}
        images={images}
      />

      <section className="mt-8 rounded-2xl border border-line bg-paper-soft p-5">
        <h2 className="font-display text-2xl text-ink">Listing details</h2>
        <p className="mt-1 text-sm text-ink-soft">
          The address stays fixed after creation. Stock is adjusted separately
          so every change is audited.
        </p>
        <div className="mt-5">
          <ProductForm
            initial={{
              name: product.name,
              description: product.description ?? "",
              price: minorToEgpInput(product.price_minor),
              stock: String(product.stock),
              categoryId: product.category_id ?? "",
              status: product.status,
            }}
            productId={product.id}
            categories={categories ?? []}
            vendorId={access.vendorId}
          />
        </div>
      </section>

      <ProductTagPanel
        productId={product.id}
        vendorId={access.vendorId}
        canManage={canManage}
        tags={tagging.data.tags}
        initialTagIds={tagging.data.selectedTagIds}
        inactiveSelectionCount={tagging.data.inactiveSelectionCount}
        suggestions={tagging.data.suggestions}
      />

      {canManage && (access.role === "owner" || isPlatformAdmin) ? (
        <div className="mt-10 rounded-2xl border border-red-200 bg-red-50/50 p-5">
          <h2 className="font-display text-xl text-red-950">Danger zone</h2>
          <p className="mt-1 text-sm text-red-800">
            Deleting a product removes it from Gifto permanently. Its order
            history stays intact.
          </p>
          <div className="mt-3">
            <DeleteProductButton
              productId={product.id}
              vendorId={access.vendorId}
              productName={product.name}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
