"use server";

import { isValidEmail } from "@/lib/guest-order";
import { sendPasswordResetEmail } from "@/lib/mail";
import { checkAuthQuota } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

export type RequestResetState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

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

  // P1-12: IP bucket plus per-email bucket (5/hr per connection, 3/hr per
  // email), fail-closed — a quota-service failure denies the attempt with
  // the retry message instead of silently letting it through. The light
  // fail-open guard this replaced lived on the checkout quota table.
  const quota = await checkAuthQuota("passwordResetRequest", {
    accountKey: email,
  });
  if (quota.limited) {
    return { error: quota.message ?? "Please wait and try again.", attempt };
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
