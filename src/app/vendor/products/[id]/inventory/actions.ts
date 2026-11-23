"use server";

import { revalidatePath } from "next/cache";

import { CATALOG_TAGS, revalidatePublicCatalog } from "@/lib/catalog-cache";
import { validateStockNote } from "@/lib/inventory";
import { requireVendorRole } from "@/lib/vendor";
import { checkMutationQuota } from "@/lib/rate-limit";

const DELTA_MAX = 1_000_000;

export type AdjustStockState =
  | { error: string; attempt: number }
  | { success: string; stock: number; attempt: number }
  | null;

/**
 * Records a manual stock change for a product the caller manages. The movement
 * (and the permission check) happen inside the `adjust_product_stock` database
 * function, so this action is a thin, auditable wrapper — it never writes the
 * product row itself.
 */
export async function adjustStock(
  prev: AdjustStockState,
  formData: FormData,
): Promise<AdjustStockState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) return { error: "Missing product id.", attempt };

  const rawDelta = String(formData.get("delta") ?? "").trim();
  const delta = Number(rawDelta);
  if (
    rawDelta === "" ||
    !Number.isInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > DELTA_MAX
  ) {
    return {
      error: `Enter a non-zero whole number between -${DELTA_MAX} and ${DELTA_MAX}.`,
      attempt,
    };
  }

  const note = String(formData.get("note") ?? "").trim();
  const noteError = validateStockNote(note);
  if (noteError) {
    return { error: noteError, attempt };
  }

  const { supabase, access, canManage, user } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };

  if (!canManage) {
    return {
      error: "Only shop owners and managers can adjust stock.",
      attempt,
    };
  }

  const { data, error } = await supabase.rpc("adjust_product_stock", {
    p_product_id: productId,
    p_delta: delta,
    p_note: note || null,
  });

  if (error) return { error: error.message, attempt };

  revalidatePath(`/vendor/products/${productId}`);
  revalidatePath(`/vendor/products/${productId}/inventory`);
  revalidatePath("/vendor/products");
  revalidatePath(`/shops/${access.vendorSlug}`);
  revalidatePublicCatalog([CATALOG_TAGS.catalog]);

  return { success: "Stock updated.", stock: data, attempt };
}
