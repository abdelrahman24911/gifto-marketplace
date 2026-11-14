import Link from "next/link";
import { redirect } from "next/navigation";

import { requireVendorRole } from "@/lib/vendor";

import { VendorPageHeader } from "../../ui";
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
    <div className="w-full max-w-3xl">
      <Link
        href={`/vendor/products?vendor=${access.vendorId}`}
        className="text-sm font-medium text-ink-mute transition-colors hover:text-berry"
      >
        ← All products
      </Link>

      <div className="mt-4">
        <VendorPageHeader
          eyebrow="New listing"
          title="Add a product"
          description={
            <>
              Add a gift to {access.vendorName}. The web address is generated
              from the name and stays fixed afterwards.
            </>
          }
        />
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-paper-soft p-5">
        <h2 className="font-display text-2xl text-ink">Listing basics</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Start with a draft if you are not ready for customers to see it.
        </p>
        <div className="mt-5">
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
      </section>

      <p className="mt-4 text-xs leading-relaxed text-ink-mute">
        After saving you can add photos, occasion tags and adjust inventory.
        Products never appear on Gifto while they are drafts.
      </p>
    </div>
  );
}
