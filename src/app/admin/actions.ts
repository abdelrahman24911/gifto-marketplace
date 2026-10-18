"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { slugify } from "@/lib/slugify";

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

  const { supabase } = await requirePlatformAdmin();

  const { error } = await supabase
    .from("vendors")
    .update({ status })
    .eq("id", vendorId);

  if (error) return { vendorId, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/shops");
  revalidatePath("/account");

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

  const rate = Math.round(percentValue * 10000) / 10000; // numeric(5,4)

  const { supabase } = await requirePlatformAdmin();

  const { error } = await supabase
    .from("vendors")
    .update({ commission_rate: rate })
    .eq("id", vendorId);

  if (error) return { vendorId, error: error.message };

  revalidatePath("/admin");

  return { vendorId, success: `Commission set to ${percentValue}%.` };
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

  const { supabase } = await requirePlatformAdmin();

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
  revalidatePath("/categories");
  revalidatePath("/");

  return { success: `Category “${name}” created.` };
}
