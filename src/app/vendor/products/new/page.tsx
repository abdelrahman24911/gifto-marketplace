import { redirect } from "next/navigation";

import { requireVendorRole } from "@/lib/vendor";

import { ProductForm } from "../product-form";

export const metadata = { title: "Add product — Gifto" };

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access, canManage } = await requireVendorRole(vendor);

  if (!canManage) redirect(`/vendor/products?vendor=${access.vendorId}`);

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Add a product to {access.vendorName}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        The web address (slug) is generated from the name and stays fixed
        afterwards.
      </p>
      <div className="mt-6">
        <ProductForm
          initial={{
            name: "",
            description: "",
            price: "",
            stock: "0",
            categoryId: "",
            status: "draft",
          }}
          categories={categories ?? []}
          vendorId={access.vendorId}
        />
      </div>
    </div>
  );
}
