"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { checkMutationQuota } from "@/lib/rate-limit";
import { revalidatePublicCatalog } from "@/lib/catalog-cache";
import { getSiteUrl } from "@/lib/site-url";
import { slugify } from "@/lib/slugify";
import { createServiceClient } from "@/lib/supabase/service";

import type { VendorStatus } from "@/lib/supabase/database.types";

export type VendorActionState = {
  vendorId?: string;
  error?: string;
  success?: string;
} | null;

const ALLOWED_STATUSES: VendorStatus[] = [
  "pending",
  "active",
  "suspended",
  "rejected",
];

function readVendorId(formData: FormData): string | null {
  const vendorId = String(formData.get("vendor_id") ?? "").trim();
  return vendorId ? vendorId : null;
}

/** Platform-admin-only vendor status transition (approved/suspended/rejected). */
export async function setVendorStatus(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const vendorId = readVendorId(formData);
  const status = String(formData.get("status") ?? "") as VendorStatus;

  if (!vendorId) return { error: "Missing shop id." };
  if (!ALLOWED_STATUSES.includes(status)) {
    return { vendorId, error: "Invalid status." };
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };

  const { error } = await supabase
    .from("vendors")
    .update({ status })
    .eq("id", vendorId);

  if (error) return { vendorId, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/shops");
  revalidatePath("/shops");
  revalidatePath("/account");
  revalidatePublicCatalog();

  return { vendorId, success: `Status set to “${status}”.` };
}

/**
 * Updates a vendor's commission rate. The value is a fraction (0–1). The
 * actual rate policy is a business decision — this only records what an
 * authorized administrator configures; it does not invent a default.
 */
export async function setCommissionRate(
  _prev: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const vendorId = readVendorId(formData);
  const percentValue = Number(formData.get("commission_percent"));

  if (!vendorId) return { error: "Missing shop id." };
  if (!Number.isFinite(percentValue) || percentValue < 0 || percentValue > 100) {
    return { vendorId, error: "Commission must be between 0 and 100." };
  }

  const rate = Math.round(percentValue * 100) / 10000; // numeric(5,4)

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };

  const { error } = await supabase
    .from("vendors")
    .update({ commission_rate: rate })
    .eq("id", vendorId);

  if (error) return { vendorId, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/shops");

  return { vendorId, success: `Commission set to ${percentValue}%.` };
}

export type CreateVendorState = { error: string } | { success: string } | null;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createVendor(
  _prev: CreateVendorState,
  formData: FormData,
): Promise<CreateVendorState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const governorate = String(formData.get("governorate") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const commissionInput = String(
    formData.get("commission_percent") ?? "",
  ).trim();
  const commissionPercent =
    commissionInput === "" ? 10 : Number(commissionInput);

  if (name.length < 2 || name.length > 80) {
    return { error: "Shop name must be between 2 and 80 characters." };
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 160) {
    return { error: "Enter a valid business email address." };
  }
  if (description.length > 600) {
    return { error: "Description must be 600 characters or fewer." };
  }
  if (city.length > 80 || governorate.length > 80) {
    return { error: "City and governorate must be 80 characters or fewer." };
  }
  if (phone.length > 30) {
    return { error: "Phone number must be 30 characters or fewer." };
  }
  if (
    !Number.isFinite(commissionPercent) ||
    commissionPercent < 0 ||
    commissionPercent > 100
  ) {
    return { error: "Commission must be between 0 and 100." };
  }

  if (!slugify(name)) {
    return { error: "Shop names must contain Latin letters or numbers." };
  }

  const { user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };
  const admin = createServiceClient();

  const { data: existingVendors, error: existingError } = await admin
    .from("vendors")
    .select("id, contact_email")
    .not("contact_email", "is", null);

  if (existingError) {
    return { error: "Could not check for existing shops. Please try again." };
  }

  const duplicate = (existingVendors ?? []).some(
    (vendor) => vendor.contact_email?.trim().toLowerCase() === email,
  );

  if (duplicate) {
    return { error: "A shop with this contact email already exists." };
  }

  let redirectTo: string;
  try {
    redirectTo = `${getSiteUrl()}/auth/accept-invite`;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The public site URL is not configured correctly.",
    };
  }

  const commissionRate = Math.round(commissionPercent * 100) / 10000;

  const { data: invite, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: name,
        ...(phone ? { phone } : {}),
      },
    });

  let ownerId: string | null = null;
  let ownerWasCreated = false;

  if (!inviteError && invite?.user) {
    ownerId = invite.user.id;
    ownerWasCreated = true;
  } else {
    // Supabase rejects invitations to existing auth users. Recover the existing
    // account id and send a password-reset link instead of failing outright.
    const { data: link, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

    if (linkError || !link.user) {
      return {
        error:
          "Could not prepare the shop owner account. Check the email address and that email delivery is configured.",
      };
    }

    ownerId = link.user.id;

    const { error: resetError } =
      await admin.auth.resetPasswordForEmail(email, { redirectTo });

    if (resetError) {
      return {
        error:
          "The owner already has an account, but the password-reset email could not be sent. The shop was not created.",
      };
    }
  }

  if (!ownerId) {
    return {
      error: "Could not identify the shop owner account. The shop was not created.",
    };
  }

  const { data: vendorId, error: createError } = await admin.rpc(
    "create_vendor_for_owner",
    {
      p_name: name,
      p_description: description || null,
      p_city: city || null,
      p_governorate: governorate || null,
      p_contact_phone: phone || null,
      p_contact_email: email,
      p_commission_rate: commissionRate,
      p_profile_id: ownerId,
    },
  );

  if (createError || !vendorId) {
    if (ownerWasCreated) {
      await admin.auth.admin.deleteUser(ownerId);
    }
    return {
      error:
        createError?.code === "23505"
          ? "A shop with this contact email already exists."
          : "Could not create the shop. The invitation was cancelled.",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/shops");
  revalidatePath("/shops");
  revalidatePath("/account");

  return {
    success: ownerWasCreated
      ? `“${name}” was created and an invitation was sent to ${email}. The shop stays pending until you activate it.`
      : `“${name}” was created. ${email} already has an account, so a password-reset link was sent instead of an invitation. The shop stays pending until you activate it.`,
  };
}

export type CategoryActionState = { error: string } | { success: string } | null;

/**
 * Creates a public category. The slug is derived in the application with the
 * same rules the database uses, so a duplicate name fails cleanly instead of
 * producing a second, differently-slugified row.
 */
export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    return { error: "Category name must be between 2 and 80 characters." };
  }

  const slug = slugify(name);
  if (!slug) {
    return {
      error: "Category names must contain Latin letters or numbers.",
    };
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };

  const { error } = await supabase.from("categories").insert({
    name,
    slug,
    description: description || null,
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A category with this name already exists."
          : error.message,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath("/");
  revalidatePublicCatalog();

  return { success: `Category “${name}” created.` };
}

export type CategoryMutationState = {
  categoryId?: string;
  error?: string;
  success?: string;
} | null;

function readCategoryId(formData: FormData): string | null {
  const categoryId = String(formData.get("category_id") ?? "").trim();
  return categoryId ? categoryId : null;
}

/**
 * Updates the editable parts of a category. The slug is deliberately left
 * untouched: renaming a category must not silently break public category URLs,
 * bookmarks, or search results.
 */
export async function updateCategory(
  _prev: CategoryMutationState,
  formData: FormData,
): Promise<CategoryMutationState> {
  const categoryId = readCategoryId(formData);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const positionInput = String(formData.get("position") ?? "").trim();
  const position = Number(positionInput);
  const isActive = formData.get("is_active") === "on";

  if (!categoryId) return { error: "Missing category id." };
  if (name.length < 2 || name.length > 80) {
    return {
      categoryId,
      error: "Category name must be between 2 and 80 characters.",
    };
  }
  if (description.length > 200) {
    return {
      categoryId,
      error: "Description must be 200 characters or fewer.",
    };
  }
  if (
    !positionInput ||
    !Number.isInteger(position) ||
    position < 0 ||
    position > 10_000
  ) {
    return {
      categoryId,
      error: "Position must be a whole number between 0 and 10,000.",
    };
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };

  const { data: updated, error } = await supabase
    .from("categories")
    .update({
      name,
      description: description || null,
      position,
      is_active: isActive,
    })
    .eq("id", categoryId)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      categoryId,
      error:
        error.code === "23505"
          ? "Another category already uses this name."
          : error.message,
    };
  }
  if (!updated) {
    return { categoryId, error: "This category no longer exists." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath("/");
  revalidatePublicCatalog();

  return {
    categoryId,
    success: `“${name}” updated. Its public URL stayed the same.`,
  };
}

/**
 * Deletes a category after an explicit confirmation. Products keep existing and
 * become uncategorised (`category_id` is `on delete set null`); occasion links
 * to this category are removed by the database cascade.
 */
export async function deleteCategory(
  _prev: CategoryMutationState,
  formData: FormData,
): Promise<CategoryMutationState> {
  const categoryId = readCategoryId(formData);
  const confirmation = String(formData.get("confirm") ?? "");

  if (!categoryId) return { error: "Missing category id." };
  if (confirmation !== "yes") {
    return {
      categoryId,
      error: "Tick the confirmation box before deleting this category.",
    };
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };

  const { data: existing, error: readError } = await supabase
    .from("categories")
    .select("name, slug")
    .eq("id", categoryId)
    .maybeSingle();

  if (readError) {
    return { categoryId, error: "Could not load this category. Try again." };
  }
  if (!existing) {
    return { categoryId, error: "This category no longer exists." };
  }

  const { data: deleted, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { categoryId, error: error.message };
  }
  if (!deleted) {
    return { categoryId, error: "This category no longer exists." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  revalidatePath(`/categories/${existing.slug}`);
  revalidatePath("/");
  revalidatePublicCatalog();

  return {
    success: `Category “${existing.name}” deleted. Its products are now uncategorised.`,
  };
}
