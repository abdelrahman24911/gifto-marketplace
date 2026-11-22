"use server";

import { getLocale } from "next-intl/server";

import {
  PUBLIC_REFERENCE_PATTERN,
  isValidEmail,
} from "@/lib/guest-order";
import { sendGuestOrderRecoveryEmail } from "@/lib/mail";
import { checkAuthQuota } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

export type RecoverOrderState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

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

  // P1-12: IP bucket plus a per-target bucket (order reference + contact),
  // fail-closed. The previous fail-open guard lived on the checkout quota
  // table and was IP-only.
  const quota = await checkAuthQuota("orderRecovery", {
    accountKey: `${reference}:${contact.toLowerCase()}`,
  });
  if (quota.limited) {
    return {
      error: quota.message ?? "Please wait and try again.",
      attempt,
    };
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
      // The recovery token travels in the URL FRAGMENT (#token=...), never
      // in the query string: fragments are never sent to the server, so
      // the token never lands in access logs, browser history entries
      // for a server request, or Referer headers. The confirm page reads
      // it client-side and redeems it with a POST (server action).
      //
      // S-07: the link is built in the locale the customer requested
      // the recovery from. A bare link opened by an Arabic-preference
      // browser makes next-intl redirect to /ar/..., and whether the
      // #token fragment survives that redirect depends on the browser
      // — a locale-prefixed link never redirects, so the fragment
      // always arrives intact. getLocale() may be unavailable outside
      // a locale request (e.g. unit tests); the bare link then rewrites
      // to /en/... internally with the URL unchanged, so it still works.
      let localePrefix = "";
      try {
        if ((await getLocale()) === "ar") localePrefix = "/ar";
      } catch {
        localePrefix = "";
      }
      const recoveryUrl =
        `${getSiteUrl()}${localePrefix}/orders/recover/confirm?order=${row.order_id}` +
        `#token=${row.recovery_token}`;
      await sendGuestOrderRecoveryEmail(
        row.contact_email,
        reference,
        recoveryUrl,
        row.recovery_token,
      );
    }
    // No match, no email on the order, or a send failure: same generic reply.
  } catch {
    // Same generic reply — never reveal whether the order exists.
  }

  return { success: genericSuccess, attempt };
}
