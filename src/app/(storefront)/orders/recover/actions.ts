"use server";

import { headers } from "next/headers";

import {
  PUBLIC_REFERENCE_PATTERN,
  clientIpFromHeaders,
  isValidEmail,
  sha256Hex,
} from "@/lib/guest-order";
import { sendGuestOrderRecoveryEmail } from "@/lib/mail";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

export type RecoverOrderState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const RECOVERY_RATE_LIMIT = 5;
const RECOVERY_RATE_WINDOW_SECONDS = 60 * 60;

/**
 * Requests a guest-order recovery link (P1-02, H-18).
 *
 * The customer proves the order reference plus the phone or email used at
 * checkout. On a match the database issues a single-use, 1-hour recovery
 * token and the link is emailed to the address used at checkout — the only
 * delivery channel (no SMS). The reply is always the same generic message,
 * whether or not anything matched, so the endpoint cannot probe for orders
 * or contacts. The raw recovery token is emailed, never logged.
 *
 * Orders placed without an email address cannot receive a link; their
 * owners are told (in the generic reply's help text) to contact support.
 */
export async function requestGuestOrderRecovery(
  prev: RecoverOrderState,
  formData: FormData,
): Promise<RecoverOrderState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const reference = String(formData.get("reference") ?? "")
    .trim()
    .toUpperCase();
  const contact = String(formData.get("contact") ?? "").trim();
  const genericSuccess =
    "If that reference and contact match a guest order, a recovery link is on its way to the email used at checkout. Orders placed without an email address cannot receive a link — contact Gifto support for those.";

  if (!PUBLIC_REFERENCE_PATTERN.test(reference)) {
    return {
      error: "Enter the order reference from your confirmation, e.g. GFT-ABCDEF123456.",
      attempt,
    };
  }
  if (contact.length < 5) {
    return {
      error: "Enter the phone number or email used at checkout.",
      attempt,
    };
  }
  if (contact.includes("@") && !isValidEmail(contact)) {
    return { error: "Enter a valid email address or phone number.", attempt };
  }

  // Abuse guard, reusing the Postgres quota table behind checkout.
  try {
    const headerStore = await headers();
    const ip = clientIpFromHeaders(
      headerStore.get("x-forwarded-for"),
      headerStore.get("x-real-ip"),
    );
    const service = createServiceClient();
    const { data } = await service.rpc("consume_checkout_quota", {
      p_bucket: sha256Hex(`gifto-recovery:${ip.trim().toLowerCase()}`),
      p_limit: RECOVERY_RATE_LIMIT,
      p_window_seconds: RECOVERY_RATE_WINDOW_SECONDS,
    });
    if (typeof data === "number" && data > RECOVERY_RATE_LIMIT) {
      return {
        error:
          "Too many recovery attempts from this connection. Please wait a few minutes and try again.",
        attempt,
      };
    }
  } catch {
    // The quota check is a guard, not the feature.
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc(
      "request_guest_order_recovery",
      {
        p_public_reference: reference,
        p_contact: contact,
      },
    );

    const row = Array.isArray(data) ? data[0] : null;
    if (!error && row?.recovery_token && row?.contact_email) {
      const recoveryUrl =
        `${getSiteUrl()}/orders/recover/confirm?order=${row.order_id}` +
        `&token=${row.recovery_token}`;
      await sendGuestOrderRecoveryEmail(
        row.contact_email,
        reference,
        recoveryUrl,
      );
    }
    // No match, no email on the order, or a send failure: same generic reply.
  } catch {
    // Same generic reply — never reveal whether the order exists.
  }

  return { success: genericSuccess, attempt };
}
