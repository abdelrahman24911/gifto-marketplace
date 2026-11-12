"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { CATALOG_TAGS, revalidatePublicCatalog } from "@/lib/catalog-cache";
import { isUuid } from "@/lib/occasions";
import { slugify } from "@/lib/slugify";
import {
  TAG_DESCRIPTION_MAX,
  normalizeTagDescription,
  validateTagInput,
  type TagFieldErrors,
  type TagInputValues,
} from "@/lib/tagging";

export type TagActionState = {
  attempt: number;
  values?: TagInputValues;
  fieldErrors?: TagFieldErrors;
  error?: string;
  success?: string;
  tagId?: string;
} | null;

export type TagToggleState = {
  attempt: number;
  error?: string;
  success?: string;
} | null;

export type TagReviewState = {
  attempt: number;
  error?: string;
  success?: string;
} | null;

function nextAttempt(previous: { attempt?: number } | null): number {
  return (previous?.attempt ?? 0) + 1;
}

function readTagValues(formData: FormData): TagInputValues {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
}

function revalidateTagSurfaces() {
  revalidatePath("/admin/tags");
  revalidatePath("/admin/occasions", "layout");
  revalidatePath("/vendor/products", "layout");
  revalidatePath("/occasions/[slug]", "page");
  revalidatePublicCatalog([CATALOG_TAGS.catalog, CATALOG_TAGS.occasions]);
}

function tagWriteErrorMessage(error: {
  code?: string;
  message?: string;
} | null): string {
  if (
    error?.code === "42501" ||
    /platform administrator|permission/i.test(error?.message ?? "")
  ) {
    return "Only platform administrators can manage tags.";
  }
  if (error?.code === "23505") {
    return "A tag with this name or URL already exists.";
  }
  return "Could not save the tag. Please try again.";
}

export async function createTag(
  previous: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const rawValues = readTagValues(formData);
  const validation = validateTagInput(rawValues);

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

  const { data: existing, error: existingError } = await supabase
    .from("tags")
    .select("id, is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) {
    return {
      attempt,
      values: validation.values,
      error: "Could not check whether this tag is available. Please try again.",
    };
  }

  if (existing) {
    return {
      attempt,
      values: validation.values,
      fieldErrors: { name: "A tag with this name already exists." },
      error: existing.is_active
        ? "That tag is already active in the vocabulary."
        : "That tag already exists but is inactive. Reactivate it from the list below.",
    };
  }

  const { data: created, error } = await supabase
    .from("tags")
    .insert({
      name: validation.values.name,
      slug,
      description: validation.values.description || null,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    return {
      attempt,
      values: validation.values,
      error: tagWriteErrorMessage(error),
    };
  }

  revalidateTagSurfaces();

  return {
    attempt,
    values: validation.values,
    tagId: created.id,
    success: `Tag "${validation.values.name}" created and active.`,
  };
}

export async function updateTag(
  previous: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const tagId = String(formData.get("tag_id") ?? "").trim();
  const rawValues = readTagValues(formData);
  const validation = validateTagInput(rawValues);

  if (!isUuid(tagId)) {
    return { attempt, error: "That tag id is not valid." };
  }

  if (!validation.ok) {
    return {
      attempt,
      values: validation.values,
      fieldErrors: validation.fieldErrors,
      error: "Check the highlighted fields and try again.",
    };
  }

  const { data: updated, error } = await supabase
    .from("tags")
    .update({
      name: validation.values.name,
      description: validation.values.description || null,
    })
    .eq("id", tagId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      attempt,
      values: validation.values,
      error: tagWriteErrorMessage(error),
    };
  }

  if (!updated) {
    return { attempt, error: "That tag no longer exists." };
  }

  revalidateTagSurfaces();

  return {
    attempt,
    values: validation.values,
    tagId,
    success: "Tag details saved. Its public slug did not change.",
  };
}

export async function setTagActive(
  previous: TagToggleState,
  formData: FormData,
): Promise<TagToggleState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const tagId = String(formData.get("tag_id") ?? "").trim();
  const state = String(formData.get("state") ?? "");

  if (!isUuid(tagId)) {
    return { attempt, error: "That tag id is not valid." };
  }

  if (state !== "active" && state !== "inactive") {
    return { attempt, error: "Choose a valid tag state." };
  }

  const isActive = state === "active";
  const { data: updated, error } = await supabase
    .from("tags")
    .update({ is_active: isActive })
    .eq("id", tagId)
    .select("name")
    .maybeSingle();

  if (error) {
    return { attempt, error: tagWriteErrorMessage(error) };
  }

  if (!updated) {
    return { attempt, error: "That tag no longer exists." };
  }

  revalidateTagSurfaces();

  return {
    attempt,
    success: isActive
      ? `"${updated.name}" is active again.`
      : `"${updated.name}" is inactive. Existing assignments remain but are ignored publicly.`,
  };
}

export async function reviewTagSuggestion(
  previous: TagReviewState,
  formData: FormData,
): Promise<TagReviewState> {
  const { supabase } = await requirePlatformAdmin();
  const attempt = nextAttempt(previous);
  const suggestionId = String(formData.get("suggestion_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  const rejectionReason = normalizeTagDescription(
    String(formData.get("rejection_reason") ?? ""),
  );

  if (!isUuid(suggestionId)) {
    return { attempt, error: "That tag suggestion id is not valid." };
  }

  if (decision !== "approve" && decision !== "reject") {
    return { attempt, error: "Choose whether to approve or reject." };
  }

  if (rejectionReason.length > TAG_DESCRIPTION_MAX) {
    return {
      attempt,
      error: `A rejection reason must be ${TAG_DESCRIPTION_MAX} characters or fewer.`,
    };
  }

  const approve = decision === "approve";
  const { error } = await supabase.rpc("review_tag_suggestion", {
    p_suggestion_id: suggestionId,
    p_approve: approve,
    p_rejection_reason: approve ? null : rejectionReason || null,
  });

  if (error) {
    if (
      error.code === "42501" ||
      /platform administrator|permission/i.test(error.message)
    ) {
      return {
        attempt,
        error: "Only platform administrators can review tag suggestions.",
      };
    }
    if (/already been reviewed/i.test(error.message)) {
      return {
        attempt,
        error: "This suggestion was already reviewed. Refresh the queue.",
      };
    }
    if (/not found/i.test(error.message)) {
      return { attempt, error: "That tag suggestion no longer exists." };
    }
    return {
      attempt,
      error: "Could not review the suggestion. Nothing was changed.",
    };
  }

  revalidateTagSurfaces();

  return {
    attempt,
    success: approve
      ? "Suggestion approved and the tag is now available."
      : "Suggestion rejected.",
  };
}
