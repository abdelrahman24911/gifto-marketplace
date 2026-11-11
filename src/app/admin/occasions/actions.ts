"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { CATALOG_TAGS, revalidatePublicCatalog } from "@/lib/catalog-cache";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  OCCASION_IMAGES_BUCKET,
  type OccasionMatchMode,
} from "@/lib/supabase/database.types";
import {
  PRODUCT_PICKER_MAX_SELECTION,
  parseProductPickerQuery,
  type ProductPickerQueryInput,
} from "@/lib/occasion-products";
import {
  buildOccasionImagePath,
  isUuid,
  moveOccasionId,
  occasionImagePathBelongsTo,
  validateOccasionImageFile,
  validateOccasionInput,
  type MoveDirection,
  type OccasionFieldErrors,
  type OccasionFormValues,
} from "@/lib/occasions";

import {
  loadProductPickerPage,
  type ProductPickerPageLoad,
} from "./product-picker-data";

export type OccasionFormState = {
  attempt: number;
  values: OccasionFormValues;
  error?: string;
  fieldErrors?: OccasionFieldErrors;
  success?: string;
  warning?: string;
  occasionId?: string;
  slug?: string;
  imagePath?: string | null;
} | null;

export type OccasionSimpleState = {
  attempt: number;
  occasionId?: string;
  error?: string;
  success?: string;
  warning?: string;
} | null;

type ServerClient = Awaited<ReturnType<typeof requirePlatformAdmin>>["supabase"];

type OccasionUpdate = {
  name: string;
  slug: string;
  description: string | null;
  image_alt: string | null;
  is_active: boolean;
  match_mode: OccasionMatchMode;
  image_path?: string;
};

type RawOccasionValues = {
  name: string;
  slug: string;
  description: string;
  imageAlt: string;
  matchMode: string;
  isActive: boolean;
};

function nextAttempt(previous: { attempt?: number } | null): number {
  return (previous?.attempt ?? 0) + 1;
}

function readRawValues(formData: FormData): RawOccasionValues {
  return {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    imageAlt: String(formData.get("image_alt") ?? ""),
    matchMode: String(formData.get("match_mode") ?? ""),
    isActive:
      formData.get("is_active") === "on" ||
      formData.get("is_active") === "true",
  };
}

function readImage(formData: FormData): File | null {
  const value = formData.get("image");
  return value instanceof File && value.size > 0 ? value : null;
}

function formError(
  attempt: number,
  values: OccasionFormValues,
  error: string,
  fieldErrors?: OccasionFieldErrors,
): OccasionFormState {
  return { attempt, values, error, fieldErrors };
}

function revalidateOccasionSurfaces({
  id,
  slug,
  oldSlug,
}: {
  id?: string;
  slug?: string;
  oldSlug?: string;
}) {
  revalidatePath("/admin/occasions");
  if (id) revalidatePath(`/admin/occasions/${id}/edit`);
  revalidatePath("/");
  if (oldSlug) revalidatePath(`/occasions/${oldSlug}`);
  if (slug) revalidatePath(`/occasions/${slug}`);
  revalidatePublicCatalog([CATALOG_TAGS.occasions]);
}

async function findSlugConflict(
  supabase: ServerClient,
  slug: string,
  currentId?: string,
): Promise<string | null> {
  const currentQuery = currentId
    ? supabase
        .from("occasions")
        .select("id")
        .eq("slug", slug)
        .neq("id", currentId)
        .limit(1)
    : supabase.from("occasions").select("id").eq("slug", slug).limit(1);

  const [{ data: current, error: currentError }, { data: redirect, error: redirectError }] =
    await Promise.all([
      currentQuery,
      supabase
        .from("occasion_slug_redirects")
        .select("old_slug, occasion_id")
        .eq("old_slug", slug)
        .maybeSingle(),
    ]);

  if (currentError || redirectError) {
    return "Could not check whether this URL slug is available. Please try again.";
  }

  if ((current ?? []).length > 0) {
    return "Another occasion already uses this URL slug.";
  }

  if (redirect && (!currentId || redirect.occasion_id !== currentId)) {
    return "This slug was used before. Choose a different URL slug.";
  }

  return null;
}

/**
 * Creates or updates one occasion. Occasions are created before their image is
 * uploaded because the database generates the id that owns the storage folder.
 */
export async function saveOccasion(
  previous: OccasionFormState,
  formData: FormData,
): Promise<OccasionFormState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const occasionIdRaw = String(formData.get("occasion_id") ?? "").trim();
  const occasionId = occasionIdRaw || undefined;
  const rawValues = readRawValues(formData);
  const validation = validateOccasionInput(rawValues);
  const values = validation.values;

  if (occasionId && !isUuid(occasionId)) {
    return formError(attempt, values, "That occasion id is not valid.");
  }

  if (!validation.ok) {
    return formError(
      attempt,
      values,
      "Check the highlighted fields and try again.",
      validation.fieldErrors,
    );
  }

  const imageFile = readImage(formData);
  let image: Extract<
    Awaited<ReturnType<typeof validateOccasionImageFile>>,
    { ok: true }
  >["value"] | null = null;

  if (imageFile) {
    const imageValidation = await validateOccasionImageFile(imageFile);
    if (!imageValidation.ok) {
      return formError(attempt, values, imageValidation.error, {
        image: imageValidation.error,
      });
    }
    image = imageValidation.value;
  }

  const slugConflict = await findSlugConflict(supabase, values.slug, occasionId);
  if (slugConflict) {
    return formError(attempt, values, slugConflict, { slug: slugConflict });
  }

  const description = values.description || null;
  const imageAlt = values.imageAlt || null;
  const bucket = supabase.storage.from(OCCASION_IMAGES_BUCKET);

  if (!occasionId) {
    const { data: lastOrder, error: orderError } = await supabase
      .from("occasions")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError) {
      return formError(
        attempt,
        values,
        "Could not prepare the occasion order. Please try again.",
      );
    }

    const { data: created, error: createError } = await supabase
      .from("occasions")
      .insert({
        name: values.name,
        slug: values.slug,
        description,
        image_alt: imageAlt,
        is_active: values.isActive,
        match_mode: values.matchMode,
        sort_order: (lastOrder?.sort_order ?? -1) + 1,
      })
      .select("id, slug")
      .single();
    let createdImagePath: string | null = null;

    if (createError || !created) {
      const slugError =
        createError?.code === "23505"
          ? "Another occasion already uses this URL slug."
          : "Could not create the occasion. Please try again.";
      return formError(
        attempt,
        values,
        slugError,
        createError?.code === "23505" ? { slug: slugError } : undefined,
      );
    }

    if (created.slug !== values.slug) {
      const { error: cleanupError } = await supabase
        .from("occasions")
        .delete()
        .eq("id", created.id);
      const slugError = cleanupError
        ? "That URL slug is already in use. The conflicting empty draft could not be removed; delete it from the list."
        : "That URL slug is already in use. Choose another.";
      return formError(attempt, values, slugError, {
        slug: "That URL slug is already in use.",
      });
    }

    if (imageFile && image) {
      const path = buildOccasionImagePath(created.id, image.extension);
      const { error: uploadError } = await bucket.upload(path, imageFile, {
        contentType: image.contentType,
        upsert: false,
      });

      if (uploadError) {
        const { error: cleanupError } = await supabase
          .from("occasions")
          .delete()
          .eq("id", created.id);
        return formError(
          attempt,
          values,
          cleanupError
            ? "The occasion was not created because its image could not be uploaded, and the empty draft could not be removed. Delete it from the list."
            : "The occasion was not created because its image could not be uploaded.",
          { image: "The image upload failed. Try a different file." },
        );
      }

      const { error: imageUpdateError } = await supabase
        .from("occasions")
        .update({ image_path: path })
        .eq("id", created.id);

      if (imageUpdateError) {
        // The Storage delete policy needs the occasion folder to still exist,
        // so remove the object before deleting the draft row.
        const { error: removeError } = await bucket.remove([path]);
        const { error: cleanupError } = await supabase
          .from("occasions")
          .delete()
          .eq("id", created.id);

        return formError(
          attempt,
          values,
          removeError && cleanupError
            ? "The occasion was not created. Neither the uploaded image nor the empty draft could be cleaned up automatically."
            : removeError
              ? "The occasion was not created, but the uploaded image could not be cleaned up."
              : cleanupError
                ? "The occasion was not created, and the empty draft could not be removed. Delete it from the list."
                : "The occasion was not created because its image could not be attached.",
          { image: "The image could not be saved. Try again." },
        );
      }

      createdImagePath = path;
    }

    revalidateOccasionSurfaces({ id: created.id, slug: created.slug });

    return {
      attempt,
      values,
      occasionId: created.id,
      slug: created.slug,
      imagePath: createdImagePath,
      success: values.isActive
        ? `“${values.name}” was created and published.`
        : `“${values.name}” was created as a hidden occasion.`,
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("occasions")
    .select("id, slug, image_path")
    .eq("id", occasionId)
    .maybeSingle();

  if (existingError) {
    return formError(
      attempt,
      values,
      "Could not load this occasion. Please try again.",
    );
  }

  if (!existing) {
    return formError(attempt, values, "That occasion no longer exists.");
  }

  let uploadedPath: string | null = null;

  if (imageFile && image) {
    uploadedPath = buildOccasionImagePath(occasionId, image.extension);
    const { error: uploadError } = await bucket.upload(uploadedPath, imageFile, {
      contentType: image.contentType,
      upsert: false,
    });

    if (uploadError) {
      return formError(
        attempt,
        values,
        "The current occasion was not changed because the new image could not be uploaded.",
        { image: "The image upload failed. Try a different file." },
      );
    }
  }

  const update: OccasionUpdate = {
    name: values.name,
    slug: values.slug,
    description,
    image_alt: imageAlt,
    is_active: values.isActive,
    match_mode: values.matchMode,
  };
  if (uploadedPath) update.image_path = uploadedPath;

  const { data: updated, error: updateError } = await supabase
    .from("occasions")
    .update(update)
    .eq("id", occasionId)
    .select("slug")
    .maybeSingle();

  if (updateError || !updated) {
    let cleanupFailed = false;

    if (uploadedPath) {
      const { error: removeError } = await bucket.remove([uploadedPath]);
      cleanupFailed = Boolean(removeError);
    }

    const message =
      updateError?.code === "23505"
        ? "Another occasion already uses this URL slug."
        : "Could not save the occasion. Your existing data is unchanged.";

    return formError(
      attempt,
      values,
      cleanupFailed
        ? `${message} The newly uploaded image could not be cleaned up.`
        : message,
      updateError?.code === "23505" ? { slug: message } : undefined,
    );
  }

  const actualSlug = updated.slug;
  let warning: string | undefined;

  if (uploadedPath && existing.image_path) {
    if (occasionImagePathBelongsTo(existing.image_path, occasionId)) {
      const { error: removeError } = await bucket.remove([existing.image_path]);
      if (removeError) {
        warning =
          "The new image is saved, but the previous image could not be removed from Storage.";
      }
    } else {
      warning =
        "The new image is saved, but the previous image path was not recognized and was left untouched.";
    }
  }

  if (actualSlug !== values.slug) {
    warning = [
      warning,
      `The URL slug was saved as “${actualSlug}” because “${values.slug}” was already in use.`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  revalidateOccasionSurfaces({
    id: occasionId,
    slug: actualSlug,
    oldSlug: existing.slug,
  });

  return {
    attempt,
    values: { ...values, slug: actualSlug },
    occasionId,
    slug: actualSlug,
    imagePath: uploadedPath ?? existing.image_path,
    success: `“${values.name}” was saved.`,
    warning,
  };
}

/**
 * Detaches an image from its occasion, then attempts to delete the stored
 * object. The database is cleared first so a Storage failure leaves an
 * orphaned file rather than a broken reference.
 */
export async function removeOccasionImage(
  previous: OccasionSimpleState,
  formData: FormData,
): Promise<OccasionSimpleState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const occasionId = String(formData.get("occasion_id") ?? "").trim();

  if (!isUuid(occasionId)) {
    return { attempt, error: "That occasion id is not valid." };
  }

  const { data: occasion, error: loadError } = await supabase
    .from("occasions")
    .select("id, slug, image_path")
    .eq("id", occasionId)
    .maybeSingle();

  if (loadError) {
    return { attempt, occasionId, error: "Could not load the occasion." };
  }

  if (!occasion) {
    return { attempt, occasionId, error: "That occasion no longer exists." };
  }

  if (!occasion.image_path) {
    return {
      attempt,
      occasionId,
      success: "This occasion already has no image.",
    };
  }

  if (!occasionImagePathBelongsTo(occasion.image_path, occasionId)) {
    return {
      attempt,
      occasionId,
      error:
        "The stored image path was not recognized. Nothing was changed.",
    };
  }

  const imagePath = occasion.image_path;
  const { data: cleared, error: clearError } = await supabase
    .from("occasions")
    .update({ image_path: null })
    .eq("id", occasionId)
    .eq("image_path", imagePath)
    .select("id")
    .maybeSingle();

  if (clearError) {
    return {
      attempt,
      occasionId,
      error: "Could not detach the image. Nothing was changed.",
    };
  }

  if (!cleared) {
    return {
      attempt,
      occasionId,
      error:
        "The image changed before it could be removed. Reload the page and try again.",
    };
  }

  const { error: storageError } = await supabase.storage
    .from(OCCASION_IMAGES_BUCKET)
    .remove([imagePath]);

  revalidateOccasionSurfaces({ id: occasionId, slug: occasion.slug });

  return {
    attempt,
    occasionId,
    success: "The occasion image was removed.",
    warning: storageError
      ? "The image was detached, but its file could not be deleted from Storage."
      : undefined,
  };
}

/** Removes the image first (the Storage policy needs the row), then the row. */
export async function deleteOccasion(
  previous: OccasionSimpleState,
  formData: FormData,
): Promise<OccasionSimpleState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const occasionId = String(formData.get("occasion_id") ?? "").trim();

  if (!isUuid(occasionId)) {
    return { attempt, error: "That occasion id is not valid." };
  }

  const { data: occasion, error: loadError } = await supabase
    .from("occasions")
    .select("id, name, slug, image_path")
    .eq("id", occasionId)
    .maybeSingle();

  if (loadError) {
    return { attempt, occasionId, error: "Could not load the occasion." };
  }

  if (!occasion) {
    return { attempt, occasionId, error: "That occasion no longer exists." };
  }

  let warning: string | undefined;
  let imageRemoved = false;

  if (occasion.image_path) {
    if (occasionImagePathBelongsTo(occasion.image_path, occasionId)) {
      // Storage delete policies check that the occasion still exists, so the
      // object must be removed before its row.
      const { error: removeError } = await supabase.storage
        .from(OCCASION_IMAGES_BUCKET)
        .remove([occasion.image_path]);
      if (removeError) {
        return {
          attempt,
          occasionId,
          error:
            "Could not delete the occasion because its image could not be removed. The occasion is still in the list; try again.",
        };
      }
      imageRemoved = true;
    } else {
      warning =
        "The occasion was deleted, but its image path was not recognized and was left untouched.";
    }
  }

  const { error: deleteError } = await supabase
    .from("occasions")
    .delete()
    .eq("id", occasionId);

  if (deleteError) {
    return {
      attempt,
      occasionId,
      error: imageRemoved
        ? "The image was removed, but the occasion could not be deleted. Try again and replace its image if needed."
        : "Could not delete the occasion. Nothing was removed.",
    };
  }

  revalidateOccasionSurfaces({
    id: occasionId,
    slug: occasion.slug,
  });

  return {
    attempt,
    occasionId,
    success: `“${occasion.name}” was deleted.`,
    warning,
  };
}

export async function setOccasionVisibility(
  previous: OccasionSimpleState,
  formData: FormData,
): Promise<OccasionSimpleState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const occasionId = String(formData.get("occasion_id") ?? "").trim();
  const nextState = String(formData.get("next_state") ?? "");

  if (!isUuid(occasionId)) {
    return { attempt, error: "That occasion id is not valid." };
  }

  if (nextState !== "published" && nextState !== "hidden") {
    return { attempt, occasionId, error: "Choose a valid visibility state." };
  }

  const isActive = nextState === "published";
  const { data: updated, error } = await supabase
    .from("occasions")
    .update({ is_active: isActive })
    .eq("id", occasionId)
    .select("id, name, slug")
    .maybeSingle();

  if (error) {
    return {
      attempt,
      occasionId,
      error: "Could not change the visibility. Please try again.",
    };
  }

  if (!updated) {
    return { attempt, occasionId, error: "That occasion no longer exists." };
  }

  revalidateOccasionSurfaces({ id: occasionId, slug: updated.slug });

  return {
    attempt,
    occasionId,
    success: isActive
      ? `“${updated.name}” is now published.`
      : `“${updated.name}” is now hidden.`,
  };
}

/**
 * Reorders the complete admin list. Hidden occasions participate so they keep
 * their place when they are published later.
 */
export async function moveOccasion(
  previous: OccasionSimpleState,
  formData: FormData,
): Promise<OccasionSimpleState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const occasionId = String(formData.get("occasion_id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "") as MoveDirection;

  if (!isUuid(occasionId)) {
    return { attempt, error: "That occasion id is not valid." };
  }

  if (direction !== "up" && direction !== "down") {
    return { attempt, occasionId, error: "Choose a valid move direction." };
  }

  const { rows, failed, truncated } = await fetchAllRows<{ id: string }>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("occasions")
        .select("id")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    },
  );

  if (failed || truncated) {
    return {
      attempt,
      occasionId,
      error:
        "Could not read the complete occasion order. No changes were made.",
    };
  }

  const result = moveOccasionId(
    rows.map((row) => row.id),
    occasionId,
    direction,
  );

  if (!result.moved) {
    if (result.reason === "first") {
      return { attempt, occasionId, success: "This occasion is already first." };
    }
    if (result.reason === "last") {
      return { attempt, occasionId, success: "This occasion is already last." };
    }
    return {
      attempt,
      occasionId,
      error: "That occasion is no longer in the list. Refresh and try again.",
    };
  }

  const { error } = await supabase.rpc("reorder_occasions", {
    p_occasion_ids: result.ids,
  });

  if (error) {
    return {
      attempt,
      occasionId,
      error: "Could not reorder the occasions. No changes were saved.",
    };
  }

  revalidateOccasionSurfaces({ id: occasionId });

  return {
    attempt,
    occasionId,
    success: direction === "up" ? "Moved up." : "Moved down.",
  };
}

export type OccasionProductsState = {
  attempt: number;
  productIds?: string[];
  error?: string;
  success?: string;
} | null;

export type OccasionMatchingRulesState = {
  attempt: number;
  categoryIds?: string[];
  tagIds?: string[];
  error?: string;
  success?: string;
} | null;

function readUuidList(
  formData: FormData,
  field: string,
  label: string,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const value of formData.getAll(field)) {
    const id = String(value).trim();
    if (!isUuid(id)) {
      return {
        ok: false,
        error: `One or more selected ${label} are not valid.`,
      };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return { ok: true, ids };
}

function matchingRulesErrorMessage(error: {
  code?: string;
  message?: string;
} | null): string {
  const message = error?.message ?? "";

  if (
    error?.code === "42501" ||
    /platform administrator|permission/i.test(message)
  ) {
    return "You do not have permission to change this occasion.";
  }
  if (message.includes("active approved tags")) {
    return "One or more selected tags are no longer active. Reload the page and choose again.";
  }
  if (message.includes("do not exist")) {
    return "One or more selected categories or tags no longer exist. Reload the page and try again.";
  }
  if (message.includes("Occasion not found")) {
    return "That occasion no longer exists.";
  }

  return "The matching rules could not be saved. Nothing was changed.";
}

function readProductIds(
  formData: FormData,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const raw = formData.getAll("product_ids");
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const value of raw) {
    const id = String(value).trim();
    if (!isUuid(id)) {
      return {
        ok: false,
        error: "One or more selected products are not valid.",
      };
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  if (ids.length > PRODUCT_PICKER_MAX_SELECTION) {
    return {
      ok: false,
      error: `You can select at most ${PRODUCT_PICKER_MAX_SELECTION} products.`,
    };
  }

  return { ok: true, ids };
}

function productSelectionErrorMessage(error: {
  code?: string;
  message?: string;
} | null): string {
  const message = error?.message ?? "";

  if (
    error?.code === "42501" ||
    /platform administrator|permission/i.test(message)
  ) {
    return "You do not have permission to change this occasion.";
  }
  if (message.includes("at most 500")) {
    return `You can select at most ${PRODUCT_PICKER_MAX_SELECTION} products.`;
  }
  if (message.includes("do not exist")) {
    return "One or more selected products no longer exist. Refresh the list and try again.";
  }
  if (message.includes("Occasion not found")) {
    return "That occasion no longer exists.";
  }

  return "The product selection could not be saved. Nothing was changed.";
}

/** Loads one available-products page for the authenticated admin picker. */
export async function loadProductPickerPageAction(
  input: ProductPickerQueryInput,
): Promise<ProductPickerPageLoad> {
  const { supabase } = await requirePlatformAdmin();
  return loadProductPickerPage(supabase, parseProductPickerQuery(input));
}

/** Atomically replaces an occasion's manual product picks in the submitted order. */
export async function saveOccasionProducts(
  previous: OccasionProductsState,
  formData: FormData,
): Promise<OccasionProductsState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const occasionId = String(formData.get("occasion_id") ?? "").trim();

  if (!isUuid(occasionId)) {
    return { attempt, error: "That occasion id is not valid." };
  }

  const parsed = readProductIds(formData);
  if (!parsed.ok) {
    return { attempt, error: parsed.error };
  }

  const { error } = await supabase.rpc("replace_occasion_products", {
    p_occasion_id: occasionId,
    p_product_ids: parsed.ids,
  });

  if (error) {
    return {
      attempt,
      error: productSelectionErrorMessage(error),
    };
  }

  revalidateOccasionSurfaces({ id: occasionId });

  return {
    attempt,
    productIds: parsed.ids,
    success:
      parsed.ids.length === 0
        ? "All manual product picks were removed."
        : `${parsed.ids.length} ${parsed.ids.length === 1 ? "product" : "products"} saved.`,
  };
}

/** Atomically replaces category and tag matching rules for one occasion. */
export async function saveOccasionMatchingRules(
  previous: OccasionMatchingRulesState,
  formData: FormData,
): Promise<OccasionMatchingRulesState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const occasionId = String(formData.get("occasion_id") ?? "").trim();

  if (!isUuid(occasionId)) {
    return { attempt, error: "That occasion id is not valid." };
  }

  const categoryResult = readUuidList(
    formData,
    "category_ids",
    "categories",
  );
  if (!categoryResult.ok) {
    return { attempt, error: categoryResult.error };
  }

  const tagResult = readUuidList(formData, "tag_ids", "tags");
  if (!tagResult.ok) {
    return { attempt, error: tagResult.error };
  }

  const { error } = await supabase.rpc("replace_occasion_matching_rules", {
    p_occasion_id: occasionId,
    p_category_ids: categoryResult.ids,
    p_tag_ids: tagResult.ids,
  });

  if (error) {
    return { attempt, error: matchingRulesErrorMessage(error) };
  }

  revalidateOccasionSurfaces({ id: occasionId });

  const categoryCount = categoryResult.ids.length;
  const tagCount = tagResult.ids.length;

  return {
    attempt,
    categoryIds: categoryResult.ids,
    tagIds: tagResult.ids,
    success:
      categoryCount === 0 && tagCount === 0
        ? "Matching rules cleared. Manual picks still follow the occasion's matching mode."
        : `Matching rules saved: ${categoryCount} ${
            categoryCount === 1 ? "category" : "categories"
          } and ${tagCount} ${tagCount === 1 ? "tag" : "tags"}.`,
  };
}
