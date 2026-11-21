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
import { notifyOrderPlaced } from "@/lib/mail";
import { isGovernorate } from "@/lib/governorates";
import { validateGiftOptions } from "@/lib/gift-options";
import {
  coverageFromJson,
  deliveryCoverageAllows,
} from "@/lib/vendor-settings";
import {
  buildPriceDiff,
  parseExpectedPrices,
  type ExpectedPrice,
  type PriceDiff,
} from "@/lib/price-consent";

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
  giftWrap: boolean;
  giftMessage: string;
  preferredDeliveryDate: string;
  deliveryTimeNote: string;
};

export type CheckoutState =
  | { error: string; values: CheckoutValues; attempt: number }
  | { orderId: string; isGuest: boolean; attempt: number }
  | { priceChanged: PriceDiff; values: CheckoutValues; attempt: number }
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
    giftWrap: formData.get("gift_wrap") === "1",
    giftMessage: String(formData.get("gift_message") ?? "").trim(),
    preferredDeliveryDate: String(
      formData.get("preferred_delivery_date") ?? "",
    ).trim(),
    deliveryTimeNote: String(formData.get("delivery_time_note") ?? "").trim(),
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
 * Records a PRICE_CHANGED refusal durably (migration 64, S-08).
 *
 * The refusal itself rolls its transaction back, so the audit row is
 * written in a separate transaction through the service-role recorder
 * — the same client this action already uses for guest checkout. The
 * recorder verifies the mismatch against live prices itself, so a stale
 * call records nothing. Best-effort and never throws: the refusal
 * response must not fail because the audit row did.
 */
async function recordPriceConsentRefusal(args: {
  items: unknown;
  expectedPrices: ExpectedPrice[];
  expectedTotalMinor: number;
  idempotencyKey: string;
  userId: string | null;
  guestTokenHash: string | null;
}): Promise<void> {
  try {
    const service = createServiceClient();
    await service.rpc("_record_price_consent_refusal", {
      p_idempotency_key: args.idempotencyKey,
      p_items: args.items as Json,
      p_user_id: args.userId,
      p_guest_token_hash: args.guestTokenHash,
      p_expected_prices: args.expectedPrices as unknown as Json,
      p_expected_total_minor: args.expectedTotalMinor,
    });
  } catch {
    // Audit-only: never break the refusal response.
  }
}

/**
 * Builds the price-changed state after the database refuses an order: the
 * live prices are re-read so the UI can show the old-vs-new diff and ask
 * the customer to confirm the new prices before resubmitting.
 */
async function priceChangedState(
  items: unknown,
  expectedPrices: ExpectedPrice[],
  values: CheckoutValues,
  attempt: number,
): Promise<CheckoutState> {
  const fallback: CheckoutState = {
    error:
      "A price changed since you saw it. Refresh the cart and try again.",
    values,
    attempt,
  };

  try {
    const quantities = new Map<string, number>();
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const record = item as { product_id?: unknown; quantity?: unknown };
        if (
          typeof record.product_id === "string" &&
          typeof record.quantity === "number"
        ) {
          quantities.set(record.product_id, record.quantity);
        }
      }
    }

    const service = createServiceClient();
    const { data, error } = await service
      .from("products")
      .select("id, name, price_minor")
      .in("id", requestedProductIds(items));

    if (error || !data) return fallback;
    const diff = buildPriceDiff(
      expectedPrices,
      quantities,
      data as { id: string; name: string; price_minor: number }[],
    );
    if (!diff) return fallback;
    return { priceChanged: diff, values, attempt };
  } catch {
    return fallback;
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

  // P1-03: the prices the customer saw travel with the order. They are
  // validated strictly — a malformed payload is a stale session, not an
  // order the database should price blindly. A price confirmation (sent by
  // the "confirm new prices" button after a PRICE_CHANGED refusal) carries
  // the live prices from the diff instead of the cart prices.
  let cartPrices: ExpectedPrice[] | null = null;
  try {
    cartPrices = parseExpectedPrices(
      JSON.parse(String(formData.get("expected_prices") ?? "null")),
    );
  } catch {
    cartPrices = null;
  }
  const cartTotalRaw = String(formData.get("expected_total") ?? "").trim();
  const cartTotalMinor = /^\d+$/.test(cartTotalRaw)
    ? Number(cartTotalRaw)
    : null;
  if (cartPrices === null || cartTotalMinor === null) {
    return {
      error: "Your checkout session expired. Please refresh and try again.",
      values,
      attempt,
    };
  }

  let expectedPrices = cartPrices;
  let expectedTotalMinor = cartTotalMinor;
  const confirmationRaw = String(formData.get("price_confirmation") ?? "");
  if (confirmationRaw) {
    let confirmation: {
      prices: ExpectedPrice[];
      total: number;
    } | null = null;
    try {
      const parsed: unknown = JSON.parse(confirmationRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const prices = parseExpectedPrices(record.prices);
        const total =
          typeof record.total === "number" &&
          Number.isSafeInteger(record.total) &&
          record.total >= 0
            ? record.total
            : null;
        if (prices && total !== null) confirmation = { prices, total };
      }
    } catch {
      confirmation = null;
    }
    if (!confirmation) {
      return {
        error: "Your checkout session expired. Please refresh and try again.",
        values,
        attempt,
      };
    }
    expectedPrices = confirmation.prices;
    expectedTotalMinor = confirmation.total;
  }

  if (values.contactEmail && !isValidEmail(values.contactEmail)) {
    return {
      error: "Enter a valid email address, or leave it blank.",
      values,
      attempt,
    };
  }

  // P1-06: the governorate is chosen from the dropdown, never typed.
  // A non-canonical value can only arrive from a tampered or stale
  // submit; reject it here instead of letting the DB trigger decide.
  if (!isGovernorate(values.governorate)) {
    return {
      error: "Choose a governorate from the list.",
      values,
      attempt,
    };
  }

  // UX Batch 1: gift options and the preferred delivery day. The database
  // re-validates inside the checkout wrappers; this only gives the
  // customer a friendly error without a wasted round-trip.
  const giftError = validateGiftOptions({
    giftWrap: values.giftWrap,
    giftMessage: values.giftMessage,
    preferredDeliveryDate: values.preferredDeliveryDate,
    deliveryTimeNote: values.deliveryTimeNote,
  });
  if (giftError) {
    return { error: giftError, values, attempt };
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
      "place_order_with_price_check",
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
        p_expected_prices: expectedPrices as unknown as Json,
        p_expected_total_minor: expectedTotalMinor,
        p_gift_wrap: values.giftWrap,
        p_gift_message: values.giftMessage || null,
        p_preferred_delivery_date: values.preferredDeliveryDate || null,
        p_delivery_time_note: values.deliveryTimeNote || null,
      },
    );

    if (error) {
      // P1-03: a live price differs from the cart — show the diff and ask
      // the customer to confirm the new prices instead of charging silently.
      if (error.message?.startsWith("PRICE_CHANGED")) {
        // S-08: record the refusal durably before returning the diff —
        // the refusing transaction rolled back, so without this row the
        // refused attempt would leave no audit trail.
        await recordPriceConsentRefusal({
          items,
          expectedPrices,
          expectedTotalMinor,
          idempotencyKey,
          userId: user.id,
          guestTokenHash: null,
        });
        return priceChangedState(items, expectedPrices, values, attempt);
      }
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

    // P1-01: vendor + customer order emails. A failed send never rolls the
    // order back — notifyOrderPlaced catches and logs its own failures.
    await notifyOrderPlaced(data);

    return { orderId: data, isGuest: false, attempt };
  }

  // Guest checkout: the raw token is received over HTTPS, hashed here, and the
  // database stores only the digest. The service-role client never reaches the
  // browser; it is used for this narrow, validated RPC only.
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("place_guest_order_with_price_check", {
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
      p_expected_prices: expectedPrices as unknown as Json,
      p_expected_total_minor: expectedTotalMinor,
      p_gift_wrap: values.giftWrap,
      p_gift_message: values.giftMessage || null,
      p_preferred_delivery_date: values.preferredDeliveryDate || null,
      p_delivery_time_note: values.deliveryTimeNote || null,
    });

    if (error) {
      // P1-03: a live price differs from the cart — show the diff and ask
      // the customer to confirm the new prices instead of charging silently.
      if (error.message?.startsWith("PRICE_CHANGED")) {
        // S-08: record the refusal durably (see the signed-in branch).
        await recordPriceConsentRefusal({
          items,
          expectedPrices,
          expectedTotalMinor,
          idempotencyKey,
          userId: null,
          guestTokenHash: sha256Hex(guestToken),
        });
        return priceChangedState(items, expectedPrices, values, attempt);
      }
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

    // P1-01: vendor + customer order emails (never rolls the order back).
    await notifyOrderPlaced(data);

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
