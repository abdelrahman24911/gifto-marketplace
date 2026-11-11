import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { parseProductPickerQuery } from "@/lib/occasion-products";
import { isUuid, type OccasionFormValues } from "@/lib/occasions";

import { DeleteOccasionButton } from "../../delete-occasion-button";
import { MatchingPreview } from "../../matching-preview";
import { MatchingRules } from "../../matching-rules";
import { OccasionForm } from "../../occasion-form";
import { ProductPicker } from "../../product-picker";
import {
  loadOccasionMatchingPreview,
  loadOccasionMatchingRules,
} from "../../matching-data";
import {
  loadProductPickerCategories,
  loadProductPickerPage,
  loadSelectedProducts,
} from "../../product-picker-data";

export const metadata = { title: "Edit occasion — Admin — Gifto" };

export default async function EditOccasionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();
  if (!isUuid(id)) notFound();
  const { data: occasion, error } = await supabase
    .from("occasions")
    .select(
      "id, name, slug, description, image_alt, image_path, is_active, match_mode, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load this occasion. Please try again.");
  }
  if (!occasion) notFound();

  const initialValues: OccasionFormValues = {
    name: occasion.name,
    slug: occasion.slug,
    description: occasion.description ?? "",
    imageAlt: occasion.image_alt ?? "",
    matchMode: occasion.match_mode,
    isActive: occasion.is_active,
  };

  const initialPickerQuery = parseProductPickerQuery({});
  const [selectedProducts, categoryOptions, firstPage, matchingRules, preview] =
    await Promise.all([
      loadSelectedProducts(supabase, occasion.id),
      loadProductPickerCategories(supabase),
      loadProductPickerPage(supabase, initialPickerQuery),
      loadOccasionMatchingRules(supabase, occasion.id),
      loadOccasionMatchingPreview(supabase, occasion.id),
    ]);

  if (!selectedProducts.ok) throw new Error(selectedProducts.error);
  if (!categoryOptions.ok) throw new Error(categoryOptions.error);
  if (!firstPage.ok) throw new Error(firstPage.error);
  if (!matchingRules.ok) throw new Error(matchingRules.error);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { href: "/admin/occasions", label: "Occasions" },
          { label: occasion.name },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-berry">
              Edit occasion
            </p>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                occasion.is_active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-line-strong bg-paper text-ink-mute"
              }`}
            >
              {occasion.is_active ? "Published" : "Hidden"}
            </span>
          </div>
          <h1 className="mt-2 break-words font-display text-4xl leading-none text-ink sm:text-5xl">
            {occasion.name}
          </h1>
          <p className="mt-3 break-all font-mono text-xs text-ink-mute">
            /occasions/{occasion.slug}
          </p>
        </div>
        <DeleteOccasionButton
          occasionId={occasion.id}
          occasionName={occasion.name}
        />
      </div>

      <OccasionForm
        mode="edit"
        occasionId={occasion.id}
        initialValues={initialValues}
        initialImagePath={occasion.image_path}
      />

      <ProductPicker
        occasionId={occasion.id}
        initialSelected={selectedProducts.items}
        categories={categoryOptions.categories}
        initialPage={firstPage.data}
        matchMode={occasion.match_mode}
      />

      <MatchingRules
        occasionId={occasion.id}
        matchMode={occasion.match_mode}
        categories={matchingRules.data.categories}
        tags={matchingRules.data.tags}
        initialCategoryIds={matchingRules.data.selectedCategoryIds}
        initialTagIds={matchingRules.data.selectedTagIds}
        unavailableCategories={matchingRules.data.unavailableCategories}
        unavailableTags={matchingRules.data.unavailableTags}
      />

      <MatchingPreview
        preview={preview}
        occasionIsActive={occasion.is_active}
      />
    </div>
  );
}
