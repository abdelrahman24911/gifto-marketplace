"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  GUEST_COOKIE_MAX_AGE_SECONDS,
  checkoutRateBucket,
  clientIpFromHeaders,
  guestCookieName,
  isValidEmail,
  isValidGuestToken,
  isValidIdempotencyKey,
  safeCheckoutError,
  sha256Hex,
} from "@/lib/guest-order";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  coverageFromJson,
  deliveryCoverageAllows,
} from "@/lib/vendor-settings";

import type { Json } from "@/lib/supabase/database.types";

const CHECKOUT_RATE_LIMIT = 60;
const CHECKOUT_RATE_WINDOW_SECONDS = 60 * 60;

export type CheckoutValues = {
  recipientName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine: string;
  city: string;
  governorate: string;
  notes: string;
};

export type CheckoutState =
  | { error: string; values: CheckoutValues; attempt: number }
  | { orderId: string; isGuest: boolean; attempt: number }
  | null;

function readValues(formData: FormData): CheckoutValues {
  return {
    recipientName: String(formData.get("recipient_name") ?? "").trim(),
    contactPhone: String(formData.get("contact_phone") ?? "").trim(),
    contactEmail: String(formData.get("contact_email") ?? "").trim(),
    addressLine: String(formData.get("address_line") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    governorate: String(formData.get("governorate") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
}

type CoverageVendor = {
  id: string;
  name: string;
  delivery_coverage: Json;
};

type CoverageProductRow = {
  id: string;
  vendor: CoverageVendor | CoverageVendor[] | null;
};

function requestedProductIds(items: unknown): string[] {
  if (!Array.isArray(items)) return [];

  const ids = items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = (item as { product_id?: unknown }).product_id;
    return typeof value === "string" ? [value] : [];
  });

  return [...new Set(ids)];
}

/**
 * Friendly pre-check for the common UI path. The database trigger on
 * `order_vendors` remains authoritative, including for direct RPC calls.
 */
async function deliveryCoverageError(
  items: unknown,
  values: CheckoutValues,
): Promise<string | null> {
  const productIds = requestedProductIds(items);
  if (productIds.length === 0) return null;

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("products")
      .select("id, vendor:vendors!inner(id, name, delivery_coverage)")
      .in("id", productIds)
      .returns<CoverageProductRow[]>();

    if (error || !data) return null;

    const vendors = new Map<string, CoverageVendor>();
    for (const row of data) {
      const vendor = Array.isArray(row.vendor) ? row.vendor[0] : row.vendor;
      if (vendor) vendors.set(vendor.id, vendor);
    }

    for (const vendor of vendors.values()) {
      if (
        !deliveryCoverageAllows(coverageFromJson(vendor.delivery_coverage), {
          city: values.city,
          governorate: values.governorate,
          addressLine: values.addressLine,
        })
      ) {
        return `${vendor.name} does not deliver to this address. Choose an address in one of its delivery areas or remove its items from the cart.`;
      }
    }
  } catch {
    // The database trigger still blocks out-of-coverage orders.
  }

  return null;
}

type QuotaResult = "ok" | "limited" | "unavailable";

async function consumeQuota(): Promise<QuotaResult> {
  try {
    const headerStore = await headers();
    const ip = clientIpFromHeaders(
      headerStore.get("x-forwarded-for"),
      headerStore.get("x-real-ip"),
    );

    const service = createServiceClient();
    const { data, error } = await service.rpc("consume_checkout_quota", {
      p_bucket: checkoutRateBucket(ip),
      p_limit: CHECKOUT_RATE_LIMIT,
      p_window_seconds: CHECKOUT_RATE_WINDOW_SECONDS,
    });

    if (error) return "unavailable";
    return typeof data === "number" && data > CHECKOUT_RATE_LIMIT
      ? "limited"
      : "ok";
  } catch {
    return "unavailable";
  }
}

/**
 * Places an order from the browser cart.
 *
 * Authentication is optional. Signed-in customers keep the existing account
 * order flow; guests are created through a service-role-only RPC from this
 * server action, and receive an HttpOnly token-scoped confirmation cookie.
 *
 * Only product ids and quantities cross the trust boundary: every price,
 * availability check, stock lock, split, commission snapshot and total is
 * recomputed by the database.
 */
export async function placeOrder(
  prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;
  const values = readValues(formData);

  const idempotencyKey = String(formData.get("idempotency_key") ?? "").trim();
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return {
      error: "Your checkout session expired. Please refresh and try again.",
      values,
      attempt,
    };
  }

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return {
      error: "Your cart could not be read. Please try again.",
      values,
      attempt,
    };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Your cart is empty.", values, attempt };
  }

  if (values.contactEmail && !isValidEmail(values.contactEmail)) {
    return {
      error: "Enter a valid email address, or leave it blank.",
      values,
      attempt,
    };
  }

  const coverageError = await deliveryCoverageError(items, values);
  if (coverageError) {
    return { error: coverageError, values, attempt };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const guestToken = String(formData.get("guest_token") ?? "").trim();
  if (!user && !isValidGuestToken(guestToken)) {
    return {
      error: "Your checkout session expired. Please refresh and try again.",
      values,
      attempt,
    };
  }

  const quota = await consumeQuota();
  if (quota === "limited") {
    return {
      error:
        "Too many checkout attempts from this connection. Please wait a few minutes and try again.",
      values,
      attempt,
    };
  }

  if (quota === "unavailable" && !user) {
    return {
      error:
        "Guest checkout is temporarily unavailable. Please try again shortly.",
      values,
      attempt,
    };
  }

  const contactEmail = values.contactEmail || null;

  if (user) {
    const { data, error } = await supabase.rpc(
      "place_order_with_idempotency",
      {
        p_items: items as Json,
        p_recipient_name: values.recipientName,
        p_contact_phone: values.contactPhone,
        p_contact_email: contactEmail,
        p_address_line: values.addressLine,
        p_city: values.city,
        p_governorate: values.governorate,
        p_notes: values.notes || null,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (error) {
      return { error: safeCheckoutError(error.message), values, attempt };
    }
    if (!data) {
      return {
        error: "The order could not be placed. Please try again.",
        values,
        attempt,
      };
    }

    revalidatePath("/account/orders");
    revalidatePath("/vendor/orders");
    revalidatePath("/admin/orders");
    revalidatePath("/shops");

    return { orderId: data, isGuest: false, attempt };
  }

  // Guest checkout: the raw token is received over HTTPS, hashed here, and the
  // database stores only the digest. The service-role client never reaches the
  // browser; it is used for this narrow, validated RPC only.
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("place_guest_order", {
      p_items: items as Json,
      p_recipient_name: values.recipientName,
      p_contact_phone: values.contactPhone,
      p_contact_email: contactEmail,
      p_address_line: values.addressLine,
      p_city: values.city,
      p_governorate: values.governorate,
      p_notes: values.notes || null,
      p_idempotency_key: idempotencyKey,
      p_guest_token_hash: sha256Hex(guestToken),
    });

    if (error) {
      return { error: safeCheckoutError(error.message), values, attempt };
    }
    if (!data) {
      return {
        error: "The order could not be placed. Please try again.",
        values,
        attempt,
      };
    }

    const cookieStore = await cookies();
    cookieStore.set({
      name: guestCookieName(data),
      value: guestToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/orders/${data}`,
      maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
    });

    revalidatePath("/vendor/orders");
    revalidatePath("/admin/orders");
    revalidatePath("/shops");

    return { orderId: data, isGuest: true, attempt };
  } catch {
    // Do not leak service configuration or database internals.
    return {
      error: "The order could not be placed. Please try again.",
      values,
      attempt,
    };
  }
}
