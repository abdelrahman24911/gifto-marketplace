"use server";

import { revalidatePath } from "next/cache";

import { revalidatePublicCatalog } from "@/lib/catalog-cache";
import { requireVendorRole } from "@/lib/vendor";
import { checkMutationQuota } from "@/lib/rate-limit";

import { PRODUCT_IMAGES_BUCKET } from "@/lib/supabase/database.types";

const MAX_IMAGES_PER_PRODUCT = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export type ImageActionState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

function attemptOf(prev: ImageActionState) {
  return (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;
}

function revalidateProductPaths(vendorId: string, productId: string) {
  revalidatePath(`/vendor/products/${productId}`);
  revalidatePath(`/vendor/products/${productId}/inventory`);
  revalidatePath("/vendor/products");
  revalidatePath("/shops");
  revalidatePath("/categories");
  revalidatePath("/occasions/[slug]", "page");
  revalidatePath("/search");
  revalidatePublicCatalog();
}

/**
 * Uploads one or more images for a product the caller manages. Files go to
 * Storage under `{vendor_id}/{product_id}/{uuid}.{ext}` — the storage policies
 * verify that path against the caller's memberships, so the vendor id here is
 * only a convenience, not the security boundary. The database row is written
 * after a successful upload; a failed insert removes the uploaded object.
 */
export async function uploadProductImages(
  prev: ImageActionState,
  formData: FormData,
): Promise<ImageActionState> {
  const attempt = attemptOf(prev);
  const productId = String(formData.get("product_id") ?? "").trim();
  if (!productId) return { error: "Missing product id.", attempt };

  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return { error: "Choose at least one image.", attempt };
  }
  if (files.length > 5) {
    return { error: "Upload up to 5 images at a time.", attempt };
  }

  const { supabase, access, canManage, user } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };
  if (!canManage) {
    return {
      error: "Only shop owners and managers can manage images.",
      attempt,
    };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("vendor_id", access.vendorId)
    .maybeSingle();
  if (!product) {
    return { error: "That product was not found in this shop.", attempt };
  }

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return { error: `"${file.name}" is larger than 5 MB.`, attempt };
    }
    if (!ALLOWED_TYPES[file.type]) {
      return {
        error: `"${file.name}" must be a JPEG, PNG, WebP or AVIF image.`,
        attempt,
      };
    }
  }

  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  if ((count ?? 0) + files.length > MAX_IMAGES_PER_PRODUCT) {
    return {
      error: `A product can have at most ${MAX_IMAGES_PER_PRODUCT} images.`,
      attempt,
    };
  }

  const { data: last } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (last?.position ?? -1) + 1;

  const bucket = supabase.storage.from(PRODUCT_IMAGES_BUCKET);
  const uploaded: string[] = [];

  for (const file of files) {
    const ext = ALLOWED_TYPES[file.type];
    const path = `${access.vendorId}/${productId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await bucket.upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      await bucket.remove(uploaded);
      return { error: `Upload failed: ${uploadError.message}`, attempt };
    }
    uploaded.push(path);

    const { error: insertError } = await supabase.from("product_images").insert({
      product_id: productId,
      path,
      alt: file.name.replace(/\.[^.]+$/, "").slice(0, 200) || null,
      position,
    });
    if (insertError) {
      await bucket.remove(uploaded);
      return { error: `Upload failed: ${insertError.message}`, attempt };
    }
    position += 1;
  }

  revalidateProductPaths(access.vendorId, productId);
  return {
    success:
      files.length === 1 ? "Image uploaded." : `${files.length} images uploaded.`,
    attempt,
  };
}

/** Removes one image row and its Storage object. */
export async function deleteProductImage(
  prev: ImageActionState,
  formData: FormData,
): Promise<ImageActionState> {
  const attempt = attemptOf(prev);
  const productId = String(formData.get("product_id") ?? "").trim();
  const path = String(formData.get("path") ?? "").trim();
  if (!productId || !path) return { error: "Missing image details.", attempt };

  const { supabase, access, canManage, user } = await requireVendorRole(
    formData.get("vendor") as string | null,
    { verifyWithAuthServer: true },
  );

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };
  if (!canManage) {
    return {
      error: "Only shop owners and managers can manage images.",
      attempt,
    };
  }

  const { data: image } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", productId)
    .eq("path", path)
    .maybeSingle();
  if (!image) {
    return { error: "That image was not found.", attempt };
  }

  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", image.id);
  if (error) return { error: error.message, attempt };

  // The object is ours if the row was; storage policies allow managers to
  // delete within their vendor folder. A missing object is fine.
  await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);

  revalidateProductPaths(access.vendorId, productId);
  return { success: "Image removed.", attempt };
}
