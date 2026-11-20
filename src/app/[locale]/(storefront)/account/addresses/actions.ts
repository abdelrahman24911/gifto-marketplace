"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  validateSavedAddressInput,
  type SavedAddressInput,
} from "@/lib/saved-address";

/**
 * Address book mutations (migration 47, UX Batch 1).
 *
 * All three actions are owner-scoped twice: `requireUser` gives the
 * caller's id, and every query filters on it — RLS is the second
 * boundary, so a tampered id can never touch another customer's rows.
 * Deleting the default promotes the oldest remaining address, so the
 * account is never left without a default once one exists.
 */

export type AddressBookState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

function readInput(formData: FormData): SavedAddressInput {
  return {
    label: String(formData.get("label") ?? "").trim(),
    recipientName: String(formData.get("recipient_name") ?? "").trim(),
    contactPhone: String(formData.get("contact_phone") ?? "").trim(),
    addressLine: String(formData.get("address_line") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    governorate: String(formData.get("governorate") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

function revalidate(): void {
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

export async function addSavedAddress(
  prev: AddressBookState,
  formData: FormData,
): Promise<AddressBookState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;
  const { supabase, user } = await requireUser();
  const input = readInput(formData);
  const validationError = validateSavedAddressInput(input);
  if (validationError) return { error: validationError, attempt };

  const wantsDefault = formData.get("is_default") === "1";

  const { count, error: countError } = await supabase
    .from("saved_addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    return { error: "Your address could not be saved. Try again.", attempt };
  }
  // The first address a customer saves becomes the default.
  const isDefault = wantsDefault || (count ?? 0) === 0;

  if (isDefault) {
    const { error: clearError } = await supabase
      .from("saved_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true);
    if (clearError) {
      return {
        error: "Your address could not be saved. Try again.",
        attempt,
      };
    }
  }

  const { error } = await supabase.from("saved_addresses").insert({
    user_id: user.id,
    label: input.label,
    recipient_name: input.recipientName,
    contact_phone: input.contactPhone,
    address_line: input.addressLine,
    city: input.city,
    governorate: input.governorate,
    notes: input.notes || null,
    is_default: isDefault,
  });
  if (error) {
    return { error: "Your address could not be saved. Try again.", attempt };
  }

  revalidate();
  return { success: "Address saved.", attempt };
}

export async function setDefaultSavedAddress(
  prev: AddressBookState,
  formData: FormData,
): Promise<AddressBookState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;
  const { supabase, user } = await requireUser();
  const addressId = String(formData.get("address_id") ?? "").trim();
  if (!addressId) return { error: "Missing address.", attempt };

  const { error: clearError } = await supabase
    .from("saved_addresses")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);
  if (clearError) {
    return {
      error: "The default address could not be changed. Try again.",
      attempt,
    };
  }

  const { data, error } = await supabase
    .from("saved_addresses")
    .update({ is_default: true })
    .eq("user_id", user.id)
    .eq("id", addressId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { error: "That address was not found.", attempt };
  }

  revalidate();
  return { success: "Default address updated.", attempt };
}

export async function deleteSavedAddress(
  prev: AddressBookState,
  formData: FormData,
): Promise<AddressBookState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;
  const { supabase, user } = await requireUser();
  const addressId = String(formData.get("address_id") ?? "").trim();
  if (!addressId) return { error: "Missing address.", attempt };

  const { data, error } = await supabase
    .from("saved_addresses")
    .delete()
    .eq("user_id", user.id)
    .eq("id", addressId)
    .select("id, is_default");
  if (error || !data || data.length === 0) {
    return { error: "That address was not found.", attempt };
  }

  // Deleting the default promotes the oldest remaining address so the
  // account keeps a default for checkout pre-fill.
  if (data[0].is_default) {
    const { data: remaining } = await supabase
      .from("saved_addresses")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (remaining && remaining.length > 0) {
      await supabase
        .from("saved_addresses")
        .update({ is_default: true })
        .eq("user_id", user.id)
        .eq("id", remaining[0].id);
    }
  }

  revalidate();
  return { success: "Address deleted.", attempt };
}
