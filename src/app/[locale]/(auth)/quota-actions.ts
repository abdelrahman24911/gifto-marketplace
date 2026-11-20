"use server";

import { checkAuthQuota } from "@/lib/rate-limit";

export type AuthQuotaGate = { limited: boolean; message?: string };

/**
 * App-flow quota gate for login (P1-12, H-12).
 *
 * Login and signup call Supabase Auth directly from the browser, so there
 * is no server action to gate; the client calls this first and only
 * touches Supabase Auth when the gate allows it. The limit is IP (20 per
 * 15 minutes) plus per-email (10 per 15 minutes), fail-closed. A caller
 * who talks to Supabase Auth directly bypasses this gate and relies on
 * Supabase's own Auth limits, which are UNVERIFIED — see
 * docs/HOSTED_STATE.md.
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
