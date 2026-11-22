"use server";

import { redirect } from "next/navigation";

import { checkAuthQuota } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

/**
 * Sets a new password after the reset link's session was exchanged by
 * /auth/callback (P1-01, H-21). Requires the recovery session; without it
 * Supabase rejects the update.
 */
export async function resetPassword(
  prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("password_confirm") ?? "");

  if (password.length < 6) {
    return {
      error: "Choose a password of at least 6 characters.",
      attempt,
    };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match.", attempt };
  }

  const supabase = await createClient();

  // P1-12: fail-closed quota on the password change itself, keyed by IP
  // plus the recovery-session account where one exists. The recovery
  // session is single-use and short-lived; the limit stops it being
  // hammered while it is valid.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const quota = await checkAuthQuota("passwordReset", {
    accountKey: user?.id,
  });
  if (quota.limited) {
    return {
      error: quota.message ?? "Please wait and try again.",
      attempt,
    };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return {
      error:
        "That reset link is invalid or has expired. Request a new one from the sign-in page.",
      attempt,
    };
  }

  redirect("/login");
}
