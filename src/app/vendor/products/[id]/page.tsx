import Link from "next/link";
import { notFound } from "next/navigation";

import { minorToEgpInput } from "@/lib/money";
import { requireVendorRole } from "@/lib/vendor";

import { DeleteProductButton } from "../delete-product-button";
import { ProductForm } from "../product-form";
import { ProductImagesPanel } from "./images/product-images-panel";

export const metadata = { title: "Edit product — Gifto" };

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

  const [{ data: product }, { data: categories }] = await Promise.all([
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
  ]);

  if (!product) notFound();

  const images = [...(product.product_images ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {product.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        {canManage ? "Editing" : "Viewing"} · /{product.slug}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/vendor/products/${product.id}/inventory?vendor=${access.vendorId}`}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          Inventory · {product.stock} in stock
        </Link>
      </div>

      {canManage ? (
        <ProductImagesPanel
          productId={product.id}
          vendorId={access.vendorId}
          images={images}
        />
      ) : images.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-3">
          {images.map((image) => (
            <li key={image.path} className="text-xs text-zinc-500">
              {image.path}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6">
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

      {canManage && (access.role === "owner" || isPlatformAdmin) ? (
        <div className="mt-10 border-t border-zinc-200 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Danger zone
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Deleting a product removes it from Gifto permanently.
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
