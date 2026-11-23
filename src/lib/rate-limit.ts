/**
 * Server-only rate limiting for auth and sensitive server actions
 * (P1-12, H-12). Reuses the checkout quota shape (migration 11): a
 * Postgres table plus a SECURITY DEFINER `consume_auth_quota` RPC
 * (migration 39) that atomically increments a bucket and returns the
 * attempt count. The caller compares the count with its limit.
 *
 * Bucketing (P1-12, step 2): every scope is keyed by caller IP *plus* an
 * account key where an account exists (target email, user id, or order
 * id). Egypt's shared CGNAT IPs mean an IP-only bucket over-blocks
 * legitimate users, so for signed-in abuse the account bucket is the
 * binding one and the IP bucket is a loose backstop.
 *
 * Privacy: buckets are SHA-256 hashes of a scope plus a caller key. Raw
 * IP addresses are never stored or logged by the limiter; the RPC prunes
 * rows older than 2 days on every call. See migration 39.
 *
 * Fail-closed (P1-12, step 3): auth actions fail closed. If the quota
 * check itself errors (database unreachable or migration 39 missing), the
 * attempt is denied with an explicit configuration/service-unavailable
 * message rather than a misleading retry message — the quota RPC lives in
 * the same Postgres as the data the action needs, so a quota failure means
 * the action would almost certainly fail anyway, and failing closed never
 * lets abuse through a broken limiter. Admin/vendor mutations remain
 * fail-closed too; this module does not fail open. Checkout keeps its own
 * fail-open behaviour; this module does not change it.
 *
 * Login/signup note: those flows call Supabase Auth directly from the
 * browser (see src/components/auth-form.tsx), so there is no server
 * action to gate. The client calls `checkLoginQuota` /
 * `checkSignupQuota` (src/app/[locale]/(auth)/quota-actions.ts) before
 * touching Supabase Auth; the gate covers the app flow. A caller who
 * talks to Supabase Auth directly bypasses the app-level gate and relies
 * on Supabase's own Auth limits, which are UNVERIFIED — see
 * docs/HOSTED_STATE.md (P1-12, step 1).
 */
import { headers } from "next/headers";

import { clientIpFromHeaders, sha256Hex } from "./guest-order";
import { createServiceClient } from "./supabase/service";

export type AuthQuotaScope =
  | "login"
  | "signup"
  | "passwordResetRequest"
  | "passwordReset"
  | "orderRecovery"
  | "orderClaim"
  | "orderCancel"
  | "refundCase"
  | "review"
  | "adminMutation"
  | "vendorMutation";

type QuotaRule = { limit: number; windowSeconds: number };

type ScopeConfig = {
  /** Loose IP backstop; the account bucket is the binding one. */
  ip: QuotaRule;
  /** Per-account bucket; absent where no account exists yet. */
  account?: QuotaRule;
  /** Human wait time shown in the retry message. */
  waitLabel: string;
  /** What the caller was trying to do, for the retry message. */
  actionLabel: string;
};

/**
 * Limits are deliberately generous for single legitimate users and tight
 * enough to stop stuffing: a real user signs in once, requests one reset,
 * or cancels one order; an attacker needs hundreds of attempts.
 */
const AUTH_QUOTAS: Record<AuthQuotaScope, ScopeConfig> = {
  login: {
    ip: { limit: 20, windowSeconds: 15 * 60 },
    account: { limit: 10, windowSeconds: 15 * 60 },
    waitLabel: "15 minutes",
    actionLabel: "sign-in attempts",
  },
  signup: {
    ip: { limit: 5, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "sign-ups",
  },
  passwordResetRequest: {
    ip: { limit: 5, windowSeconds: 60 * 60 },
    account: { limit: 3, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "password-reset requests",
  },
  passwordReset: {
    ip: { limit: 10, windowSeconds: 60 * 60 },
    account: { limit: 5, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "password changes",
  },
  orderRecovery: {
    ip: { limit: 5, windowSeconds: 60 * 60 },
    account: { limit: 5, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "order-recovery attempts",
  },
  orderClaim: {
    ip: { limit: 10, windowSeconds: 60 * 60 },
    account: { limit: 5, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "order-claim attempts",
  },
  orderCancel: {
    ip: { limit: 20, windowSeconds: 60 * 60 },
    account: { limit: 5, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "cancellation attempts",
  },
  refundCase: {
    ip: { limit: 20, windowSeconds: 60 * 60 },
    account: { limit: 5, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "refund requests",
  },
  // UX Batch 2 (reviews): a real customer reviews at most a few gifts
  // per hour; the RPC's one-review-per-product rule is the real guard.
  review: {
    ip: { limit: 20, windowSeconds: 60 * 60 },
    account: { limit: 5, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "review submissions",
  },
  adminMutation: {
    ip: { limit: 300, windowSeconds: 60 * 60 },
    account: { limit: 120, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "changes",
  },
  vendorMutation: {
    ip: { limit: 300, windowSeconds: 60 * 60 },
    account: { limit: 120, windowSeconds: 60 * 60 },
    waitLabel: "an hour",
    actionLabel: "changes",
  },
};

/** Hashed bucket for one scope + caller key; the raw key never leaves here. */
export function authRateBucket(scope: AuthQuotaScope, key: string): string {
  return sha256Hex(`gifto-auth:${scope}:${key.trim().toLowerCase()}`);
}

export function authQuotaMessage(scope: AuthQuotaScope): string {
  const config = AUTH_QUOTAS[scope];
  return `Too many ${config.actionLabel}. Please wait ${config.waitLabel} and try again.`;
}

export type AuthQuotaFailure =
  | "limit"
  | "configuration"
  | "unavailable";

export function authQuotaFailureMessage(
  failure: Exclude<AuthQuotaFailure, "limit">,
): string {
  if (failure === "configuration") {
    return "This action is temporarily unavailable because the rate-limit service is not configured. Please contact support.";
  }
  return "The rate-limit service is temporarily unavailable. Please try again in a few minutes.";
}

export type AuthQuotaResult = {
  /** True when the attempt must not proceed. */
  limited: boolean;
  /** True when the quota service itself failed (fail-closed). */
  unavailable: boolean;
  /** Why the attempt was refused; null when it may proceed. */
  failure: AuthQuotaFailure | null;
  /** Message to show the caller when limited; null otherwise. */
  message: string | null;
};

type BucketFailure = Exclude<AuthQuotaFailure, "limit">;

type ConsumeBucketResult =
  | { ok: true; attempts: number }
  | { ok: false; failure: BucketFailure; code: string | null };

function classifyQuotaError(code: string | undefined): BucketFailure {
  return code === "PGRST202" || code === "PGRST205"
    ? "configuration"
    : "unavailable";
}

async function consumeBucket(
  bucket: string,
  rule: QuotaRule,
): Promise<ConsumeBucketResult> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("consume_auth_quota", {
    p_bucket: bucket,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    const failure = classifyQuotaError(error.code);
    console.error("[rate-limit] consume_auth_quota failed", {
      code: error.code ?? null,
      message: error.message,
      failure,
    });
    return { ok: false, failure, code: error.code ?? null };
  }

  if (typeof data !== "number") {
    console.error("[rate-limit] consume_auth_quota returned a non-numeric result", {
      resultType: typeof data,
    });
    return { ok: false, failure: "unavailable", code: null };
  }

  return { ok: true, attempts: data };
}

/**
 * Consumes one attempt from the IP bucket and, when an account key is
 * given, from the account bucket. Either bucket over its limit denies
 * the attempt. Fail-closed: a quota-service error denies the attempt.
 *
 * Call after cheap input validation (so malformed requests do not burn
 * quota) and before the sensitive operation.
 */
export async function checkAuthQuota(
  scope: AuthQuotaScope,
  options: { accountKey?: string } = {},
): Promise<AuthQuotaResult> {
  const config = AUTH_QUOTAS[scope];
  const limitedResult: AuthQuotaResult = {
    limited: true,
    unavailable: false,
    failure: "limit",
    message: authQuotaMessage(scope),
  };

  function unavailableResult(failure: BucketFailure): AuthQuotaResult {
    return {
      limited: true,
      unavailable: true,
      failure,
      message: authQuotaFailureMessage(failure),
    };
  }

  try {
    const headerStore = await headers();
    const ip = clientIpFromHeaders(
      headerStore.get("x-forwarded-for"),
      headerStore.get("x-real-ip"),
      headerStore.get("x-vercel-forwarded-for"),
    );

    const ipResult = await consumeBucket(
      authRateBucket(scope, ip),
      config.ip,
    );
    if (!ipResult.ok) return unavailableResult(ipResult.failure);
    if (ipResult.attempts > config.ip.limit) return limitedResult;

    if (config.account && options.accountKey) {
      const accountResult = await consumeBucket(
        authRateBucket(scope, options.accountKey),
        config.account,
      );
      if (!accountResult.ok) return unavailableResult(accountResult.failure);
      if (accountResult.attempts > config.account.limit) return limitedResult;
    }

    return {
      limited: false,
      unavailable: false,
      failure: null,
      message: null,
    };
  } catch (error) {
    console.error("[rate-limit] quota check threw", {
      message: error instanceof Error ? error.message : String(error),
    });
    return unavailableResult("unavailable");
  }
}

/**
 * Quota check for admin/vendor mutation actions. Call immediately after
 * `requirePlatformAdmin()` / `requireVendorRole()` (which supply the
 * account id) and before the mutation. Returns the retry message when
 * genuinely over the limit, or an explicit configuration/service-unavailable
 * message when the quota service cannot be checked. It never fails open.
 */
export async function checkMutationQuota(
  kind: "admin" | "vendor",
  userId: string,
): Promise<string | null> {
  const scope: AuthQuotaScope =
    kind === "admin" ? "adminMutation" : "vendorMutation";
  const result = await checkAuthQuota(scope, { accountKey: userId });
  return result.limited ? result.message : null;
}
