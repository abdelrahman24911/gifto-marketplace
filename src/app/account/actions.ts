"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";

export type ApplyState = { error: string } | { success: string } | null;

/**
 * Submits a vendor application. The database RPC always creates a `pending`
 * vendor owned by the caller — status, commission rate and ownership are never
 * taken from client input.
 */
export async function applyAsVendor(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const { supabase } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const governorate = String(formData.get("governorate") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (name.length < 2) {
    return { error: "Shop name must be at least 2 characters." };
  }

  const { error } = await supabase.rpc("apply_as_vendor", {
    p_name: name,
    p_description: description || null,
    p_city: city || null,
    p_governorate: governorate || null,
    p_phone: phone || null,
    p_email: email || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/account");
  revalidatePath("/admin");
  revalidatePath("/shops");

  return {
    success:
      "Application submitted. Your shop stays private until a platform administrator approves it.",
  };
}
