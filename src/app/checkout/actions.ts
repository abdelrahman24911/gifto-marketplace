"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";

export type CheckoutValues = {
  recipientName: string;
  contactPhone: string;
  addressLine: string;
  city: string;
  governorate: string;
  notes: string;
};

export type CheckoutState =
  | { error: string; values: CheckoutValues; attempt: number }
  | { orderId: string; attempt: number }
  | null;

function readValues(formData: FormData): CheckoutValues {  return {
    recipientName: String(formData.get("recipient_name") ?? "").trim(),
    contactPhone: String(formData.get("contact_phone") ?? "").trim(),
    addressLine: String(formData.get("address_line") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    governorate: String(formData.get("governorate") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

/**
 * Places an order from the browser cart.
 *
 * Only product ids and quantities cross the wire: `place_order` re-reads every
 * price, re-checks stock under a row lock, splits the order per shop and writes
 * the stock ledger. Anything the client sends about prices is ignored, so a
 * tampered cart cannot change what an order costs.
 */
export async function placeOrder(
  prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;
  const values = readValues(formData);

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Your cart could not be read. Please try again.", values, attempt };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Your cart is empty.", values, attempt };
  }

  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc("place_order", {
    p_items: items,
    p_recipient_name: values.recipientName,
    p_contact_phone: values.contactPhone,
    p_address_line: values.addressLine,
    p_city: values.city,
    p_governorate: values.governorate,
    p_notes: values.notes || null,
  });

  if (error) return { error: error.message, values, attempt };
  if (!data) {
    return { error: "The order could not be placed. Please try again.", values, attempt };
  }

  revalidatePath("/account/orders");
  revalidatePath("/vendor/orders");
  revalidatePath("/shops");

  return { orderId: data, attempt };
}
