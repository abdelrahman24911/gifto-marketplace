"use server";

import { revalidatePath } from "next/cache";

import { CATALOG_TAGS, revalidatePublicCatalog } from "@/lib/catalog-cache";
import { isUuid } from "@/lib/occasions";
import { slugify } from "@/lib/slugify";
import {
  PRODUCT_TAG_LIMIT,
  validateTagInput,
  type TagFieldErrors,
  type TagInputValues,
} from "@/lib/tagging";
import { requireVendorRole } from "@/lib/vendor";

export type ProductTagAssignmentState = {
  attempt: number;
  tagIds?: string[];
  error?: string;
  success?: string;
} | null;

export type ProductTagSuggestionState = {
  attempt: number;
  values?: TagInputValues;
  fieldErrors?: TagFieldErrors;
  error?: string;
  success?: string;
} | null;

function nextAttempt(previous: { attempt?: number } | null): number {
  return (previous?.attempt ?? 0) + 1;
}

function readTagIds(formData: FormData): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of formData.getAll("tag_ids")) {
    const id = String(value).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function revalidateVendorTagSurfaces(productId: string) {
  revalidatePath("/vendor/products");
  revalidatePath(`/vendor/products/${productId}`);
  revalidatePath("/admin/tags");
  revalidatePath("/admin/occasions", "layout");
  revalidatePublicCatalog([CATALOG_TAGS.catalog, CATALOG_TAGS.occasions]);
}

export async function saveProductTags(
  previous: ProductTagAssignmentState,
  formData: FormData,
): Promise<ProductTagAssignmentState> {
  const attempt = nextAttempt(previous);
  const productId = String(formData.get("product_id") ?? "").trim();
  const tagIds = readTagIds(formData);

  if (!isUuid(productId)) {
    return { attempt, error: "That product id is not valid." };
  }

  if (tagIds.some((id) => !isUuid(id))) {
    return { attempt, error: "One of the selected tags is not valid." };
  }

  if (tagIds.length > PRODUCT_TAG_LIMIT) {
    return {
      attempt,
      error: `Choose up to ${PRODUCT_TAG_LIMIT} tags for a product.`,
    };
  }

  const { supabase, access, canManage } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  if (!canManage) {
    return {
      attempt,
      error: "Only shop owners and managers can assign product tags.",
    };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("vendor_id", access.vendorId)
    .maybeSingle();

  if (productError) {
    return {
      attempt,
      error: "Could not check the product. Nothing was changed.",
    };
  }

  if (!product) {
    return { attempt, error: "That product was not found in this shop." };
  }

  const { error } = await supabase.rpc("replace_product_tags", {
    p_product_id: productId,
    p_tag_ids: tagIds,
  });

  if (error) {
    if (
      error.code === "42501" ||
      /cannot manage tags|permission/i.test(error.message)
    ) {
      return {
        attempt,
        error: "You cannot manage tags for this product.",
      };
    }
    if (/at most 10 tags/i.test(error.message)) {
      return {
        attempt,
        error: `Choose up to ${PRODUCT_TAG_LIMIT} tags for a product.`,
      };
    }
    if (/only active approved tags/i.test(error.message)) {
      return {
        attempt,
        error:
          "One of those tags is no longer active. Refresh and choose again.",
      };
    }
    if (/product not found/i.test(error.message)) {
      return { attempt, error: "That product no longer exists." };
    }
    return {
      attempt,
      error: "Could not save product tags. Nothing was changed.",
    };
  }

  revalidateVendorTagSurfaces(productId);

  return {
    attempt,
    tagIds,
    success: tagIds.length === 0 ? "All tags removed." : "Product tags saved.",
  };
}

export async function suggestProductTag(
  previous: ProductTagSuggestionState,
  formData: FormData,
): Promise<ProductTagSuggestionState> {
  const attempt = nextAttempt(previous);
  const productId = String(formData.get("product_id") ?? "").trim();
  const rawValues = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
  const validation = validateTagInput(rawValues);

  if (!isUuid(productId)) {
    return { attempt, error: "That product id is not valid." };
  }

  if (!validation.ok) {
    return {
      attempt,
      values: validation.values,
      fieldErrors: validation.fieldErrors,
      error: "Check the highlighted fields and try again.",
    };
  }

  const slug = slugify(validation.values.name);
  if (!slug) {
    return {
      attempt,
      values: validation.values,
      fieldErrors: { name: "Use at least one Latin letter or number." },
      error: "Check the highlighted fields and try again.",
    };
  }

  const { supabase, access, canManage } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  if (!canManage) {
    return {
      attempt,
      values: validation.values,
      error: "Only shop owners and managers can suggest tags.",
    };
  }

  const { data: existingTag, error: existingError } = await supabase
    .from("tags")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) {
    return {
      attempt,
      values: validation.values,
      error: "Could not check the tag vocabulary. Please try again.",
    };
  }

  if (existingTag) {
    return {
      attempt,
      values: validation.values,
      fieldErrors: { name: "That tag already exists." },
      error: "That tag is already active. Assign it above instead.",
    };
  }

  const { error } = await supabase.from("tag_suggestions").insert({
    vendor_id: access.vendorId,
    name: validation.values.name,
    description: validation.values.description || null,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        attempt,
        values: validation.values,
        fieldErrors: { name: "You already suggested this tag." },
        error: "This shop already has a pending suggestion for that tag.",
      };
    }
    if (
      /at least 2 characters|must contain at least one letter/i.test(
        error.message,
      )
    ) {
      return {
        attempt,
        values: validation.values,
        fieldErrors: { name: "Use a valid tag name." },
        error: "Check the tag name and try again.",
      };
    }
    if (
      error.code === "42501" ||
      /permission|active member/i.test(error.message)
    ) {
      return {
        attempt,
        values: validation.values,
        error: "Only active shop members can suggest tags.",
      };
    }
    return {
      attempt,
      values: validation.values,
      error: "Could not submit the suggestion. Please try again.",
    };
  }

  revalidatePath(`/vendor/products/${productId}`);
  revalidatePath("/admin/tags");

  return {
    attempt,
    values: { name: "", description: "" },
    success: `Thanks - "${validation.values.name}" was sent to the admin review queue.`,
  };
}
