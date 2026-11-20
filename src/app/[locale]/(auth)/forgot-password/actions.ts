"use server";

import { headers } from "next/headers";

import { isValidEmail, sha256Hex } from "@/lib/guest-order";
import { clientIpFromHeaders } from "@/lib/guest-order";
import { sendPasswordResetEmail } from "@/lib/mail";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

export type RequestResetState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const RESET_RATE_LIMIT = 5;
const RESET_RATE_WINDOW_SECONDS = 60 * 60;

/**
 * Requests a password-reset email (P1-01, H-21).
 *
 * The reset link is minted with Supabase Auth's admin generateLink and sent
 * through Gifto's own mail module, so the email comes from Gifto's SMTP
 * provider rather than Supabase's default sender. The reply is always the
 * same generic message, whether or not the email belongs to an account, so
 * the endpoint cannot be used to probe for accounts. The reset link itself
 * is never logged.
 */
export async function requestPasswordReset(
  prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const genericSuccess =
    "If an account uses that email, a password-reset link is on its way. Check your inbox (and spam folder).";

  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address.", attempt };
  }

  // Light abuse guard (full auth rate limiting is P1-12): 5 requests per
  // hour per caller, reusing the Postgres quota table behind checkout.
  try {
    const headerStore = await headers();
    const ip = clientIpFromHeaders(
      headerStore.get("x-forwarded-for"),
      headerStore.get("x-real-ip"),
    );
    const service = createServiceClient();
    const { data } = await service.rpc("consume_checkout_quota", {
      p_bucket: sha256Hex(`gifto-password-reset:${ip.trim().toLowerCase()}`),
      p_limit: RESET_RATE_LIMIT,
      p_window_seconds: RESET_RATE_WINDOW_SECONDS,
    });
    if (typeof data === "number" && data > RESET_RATE_LIMIT) {
      return {
        error:
          "Too many reset requests from this connection. Please wait a few minutes and try again.",
        attempt,
      };
    }
  } catch {
    // The quota check is a guard, not the feature: a quota failure must not
    // block a legitimate reset request.
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${getSiteUrl()}/auth/callback?next=/auth/reset-password`,
      },
    });

    const resetUrl = data?.properties?.action_link;
    if (!error && resetUrl) {
      // The link is single-use and short-lived; it is sent, never logged.
      await sendPasswordResetEmail(email, resetUrl);
    }
    // Unknown email, send failure, or any other error: same generic reply.
  } catch {
    // Same generic reply — never reveal whether the account exists.
  }

  return { success: genericSuccess, attempt };
}
