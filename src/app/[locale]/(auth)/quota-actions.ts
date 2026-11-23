"use server";

import { redirect } from "next/navigation";

import { getSafeAuthPath } from "@/lib/auth-redirect";
import { checkAuthQuota } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type AuthQuotaGate = { limited: boolean; message?: string };
export type SignInState = { error: string } | null;

/**
 * App-flow quota gate for login (P1-12, H-12).
 *
 * Login is gated by the server-side signInAccount action below, which
 * performs the quota check before Supabase Auth and sets the session cookies
 * on the request. The retained helper is for compatibility with older callers.
 */
export async function checkLoginQuota(email: string): Promise<AuthQuotaGate> {
  const quota = await checkAuthQuota("login", {
    accountKey: email.trim().toLowerCase(),
  });
  return quota.limited
    ? { limited: true, message: quota.message ?? "Please wait and try again." }
    : { limited: false };
}

/**
 * App-flow quota gate for signup (P1-12, H-12). No account exists yet, so
 * the limit is IP-only: 5 sign-ups per hour per connection, fail-closed.
 */
export async function checkSignupQuota(): Promise<AuthQuotaGate> {
  const quota = await checkAuthQuota("signup");
  return quota.limited
    ? { limited: true, message: quota.message ?? "Please wait and try again." }
    : { limited: false };
}

/**
 * Authenticates through the request-scoped server client so Supabase session
 * cookies are committed before the protected-route redirect. This avoids a
 * browser-navigation race that could redirect back to /login after sign-in.
 */
export async function signInAccount(
  email: string,
  password: string,
  requestedNext?: string | null,
): Promise<SignInState> {
  const normalizedEmail = email.trim().toLowerCase();

  const quota = await checkAuthQuota("login", {
    accountKey: normalizedEmail,
  });
  if (quota.limited) {
    return {
      error: quota.message ?? "Please wait and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  redirect(getSafeAuthPath(requestedNext));
}
