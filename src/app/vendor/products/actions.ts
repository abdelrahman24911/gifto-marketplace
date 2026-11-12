"use server";

import { revalidatePath } from "next/cache";

import { revalidatePublicCatalog } from "@/lib/catalog-cache";
import { parseEgpToMinor } from "@/lib/money";
import { requireVendorRole } from "@/lib/vendor";

import { PRODUCT_IMAGES_BUCKET } from "@/lib/supabase/database.types";
import type { ProductStatus } from "@/lib/supabase/database.types";

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
const STOCK_MAX = 1_000_000;
const EDITABLE_STATUSES: ProductStatus[] = ["draft", "active", "archived"];

/** Values echoed back so a failed submit does not wipe the form. */
export type ProductFormValues = {
  name: string;
  description: string;
  price: string;
  stock: string;
  categoryId: string;
  status: ProductStatus;
};

export type ProductActionState =
  | {
      error: string;
      values: ProductFormValues;
      attempt: number;
    }
  | {
      success: string;
      productId: string;
      attempt: number;
    }
  | null;

function readValues(formData: FormData): ProductFormValues {
  const status = String(formData.get("status") ?? "draft") as ProductStatus;
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    price: String(formData.get("price") ?? "").trim(),
    stock: String(formData.get("stock") ?? "").trim(),
    categoryId: String(formData.get("category_id") ?? "").trim(),
    status: EDITABLE_STATUSES.includes(status) ? status : "draft",
  };
}

function invalid(values: ProductFormValues, error: string, attempt: number) {
  return { error, values, attempt };
}

/**
 * Creates or updates a product for a shop the caller manages. The vendor id is
 * resolved from the caller's memberships — never taken from the form — and
 * row-level security is the actual write boundary. Slugs are derived in the
 * database at insert time and stay fixed afterwards.
 */
export async function saveProduct(
  prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const attempt =
    (prev && "attempt" in prev && typeof prev.attempt === "number"
      ? prev.attempt
      : 0) + 1;

  const values = readValues(formData);
  const productId = String(formData.get("product_id") ?? "").trim() || null;

  if (values.name.length < 2 || values.name.length > NAME_MAX) {
    return invalid(
      values,
      `Product name must be between 2 and ${NAME_MAX} characters.`,
      attempt,
    );
  }

  if (values.description.length > DESCRIPTION_MAX) {
    return invalid(
      values,
      `Description must be at most ${DESCRIPTION_MAX} characters.`,
      attempt,
    );
  }

  const priceMinor = parseEgpToMinor(values.price);
  if (priceMinor === null) {
    return invalid(
      values,
      "Enter a price in EGP, for example 150 or 149.50.",
      attempt,
    );
  }

  const { supabase, access, canManage } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  if (!canManage) {
    return invalid(
      values,
      "Only shop owners and managers can manage products.",
      attempt,
    );
  }

  let categoryId: string | null = null;
  if (values.categoryId) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("id", values.categoryId)
      .eq("is_active", true)
      .maybeSingle();

    if (!category) {
      return invalid(values, "Choose an active category.", attempt);
    }
    categoryId = category.id;
  }

  if (productId) {
    const { data, error } = await supabase
      .from("products")
      .update({
        name: values.name,
        description: values.description || null,
        price_minor: priceMinor,
        category_id: categoryId,
        status: values.status,
      })
      .eq("id", productId)
      .eq("vendor_id", access.vendorId)
      .select("id, name")
      .maybeSingle();

    if (error) return invalid(values, error.message, attempt);
    if (!data) {
      return invalid(
        values,
        "That product was not found in this shop.",
        attempt,
      );
    }

    revalidatePath("/vendor/products");
    revalidatePath(`/vendor/products/${data.id}`);
    revalidatePath(`/vendor/products/${data.id}/inventory`);
    revalidatePath("/shops");
    revalidatePath("/categories");
    revalidatePath("/occasions/[slug]", "page");
    revalidatePath(`/shops/${access.vendorSlug}`);
    revalidatePublicCatalog();

    return { success: "Product updated.", productId: data.id, attempt };
  }

  // Stock is only set at creation; afterwards it moves through the audited
  // `adjust_product_stock` RPC (see the inventory page).
  const stock = values.stock === "" ? 0 : Number(values.stock);
  if (!Number.isInteger(stock) || stock < 0 || stock > STOCK_MAX) {
    return invalid(
      values,
      `Opening stock must be a whole number between 0 and ${STOCK_MAX}.`,
      attempt,
    );
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      vendor_id: access.vendorId,
      name: values.name,
      description: values.description || null,
      price_minor: priceMinor,
      stock,
      category_id: categoryId,
      status: values.status,
    })
    .select("id, name")
    .maybeSingle();

  if (error) return invalid(values, error.message, attempt);
  if (!data) return invalid(values, "Could not create the product.", attempt);

  revalidatePath("/vendor/products");
  revalidatePath("/shops");
  revalidatePath("/categories");
  revalidatePath("/occasions/[slug]", "page");
  revalidatePath(`/shops/${access.vendorSlug}`);
  revalidatePublicCatalog();

  return { success: "Product created.", productId: data.id, attempt };
}

export type DeleteProductState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

/**
 * Deletes a product. Only owners may delete (platform admins excepted) — the
 * catalog RLS policy enforces this even if this action were bypassed.
 */
export async function deleteProduct(
  prev: DeleteProductState,
  formData: FormData,
): Promise<DeleteProductState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;
  const productId = String(formData.get("product_id") ?? "").trim();

  if (!productId) return { error: "Missing product id.", attempt };

  const { supabase, access } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  // Collect image paths first so the Storage objects can be cleaned up after
  // the rows cascade away. Best-effort: a failed object removal leaves an
  // orphaned file, never a broken product deletion.
  const { data: images } = await supabase
    .from("product_images")
    .select("path")
    .eq("product_id", productId);

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("vendor_id", access.vendorId);

  if (error) return { error: error.message, attempt };

  const paths = (images ?? []).map((image) => image.path);
  if (paths.length > 0) {
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
  }

  revalidatePath("/vendor/products");
  revalidatePath("/shops");
  revalidatePath("/categories");
  revalidatePath("/occasions/[slug]", "page");
  revalidatePath(`/shops/${access.vendorSlug}`);
  revalidatePublicCatalog();

  return { success: "Product deleted.", attempt };
}
