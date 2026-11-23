import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import type {
  Database,
  VendorRole,
  VendorStatus,
} from "@/lib/supabase/database.types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type User = { id: string; email?: string };

export type RequestProfile = {
  is_platform_admin: boolean;
};

export type RequestMembership = {
  role: VendorRole;
  vendor: {
    id: string;
    name: string;
    slug: string;
    status: VendorStatus;
  } | null;
};

/**
 * Request-scoped authentication context.
 *
 * React `cache()` only memoizes for the lifetime of the current server render /
 * action, so the session, profile and memberships are shared between the
 * header and page guards without ever leaking between requests or users.
 *
 * Identity comes from `getClaims()`: the access token's signature and expiry
 * are verified locally against the project's cached JWKS (asymmetric signing
 * keys), so it costs no Auth-server round trip. It falls back to a server-side
 * `getUser()` automatically for symmetric (HS256) projects. A token for a user
 * who was banned or signed out elsewhere stays valid until it expires — the
 * same window in which PostgREST/RLS already accepts it — so mutations and
 * platform-admin access additionally call `getAuthServerUser()` below.
 */
const getSessionUser = cache(
  async (): Promise<{ supabase: ServerClient; user: User | null }> => {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;

    return {
      supabase,
      user: claims?.sub ? { id: claims.sub, email: claims.email } : null,
    };
  },
);

/**
 * Asks the Auth server whether the session is still valid (one network round
 * trip). Used for Server Actions and platform-admin access, where a revoked
 * session must not be honoured for the remainder of the token's lifetime.
 *
 * A transient Auth-server failure must NOT sign the admin out: the admin
 * console runs this check on every page load, so one failed round trip used
 * to end the session after ~1–2 minutes of use (QA, 2026-11-23). Only an
 * explicit answer — no user, or a different user — redirects. A retryable
 * failure (network error, 5xx) is retried once, then the locally verified
 * claims are trusted for this render: the token is still JWKS-verified and
 * unexpired, RLS still enforces every data read, and the next page load
 * re-checks with the Auth server.
 */
type AuthServerCheck =
  | { status: "confirmed"; user: User | null }
  | { status: "unavailable" };

function isTransientAuthError(error: {
  name?: string;
  status?: number | null;
}): boolean {
  if (error.name === "AuthRetryableFetchError") return true;
  const status = error.status;
  return (
    typeof status === "number" && (status === 0 || (status >= 500 && status < 600))
  );
}

const getAuthServerUser = cache(async (): Promise<AuthServerCheck> => {
  const supabase = await createClient();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error) {
      return {
        status: "confirmed",
        user: user ? { id: user.id, email: user.email } : null,
      };
    }
    // Explicit auth failure (bad/expired token, missing session): the session
    // really is invalid — do not retry, do not trust the claims.
    if (!isTransientAuthError(error)) {
      return { status: "confirmed", user: null };
    }
  }
  return { status: "unavailable" };
});

/**
 * Redirects to sign-in unless the Auth server confirms the same user is still
 * signed in. Runs concurrently with other work so it adds at most one overlapped
 * round trip. A transient Auth-server failure (see getAuthServerUser) leaves
 * the session alone for this render instead of signing the user out.
 */
export async function assertSessionStillValid(): Promise<void> {
  const [{ user }, server] = await Promise.all([
    getSessionUser(),
    getAuthServerUser(),
  ]);
  if (!user) redirect("/login");
  if (server.status === "unavailable") return;
  if (!server.user || server.user.id !== user.id) redirect("/login");
}

const getProfile = cache(async (): Promise<RequestProfile | null> => {
  const { supabase, user } = await getSessionUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  return data;
});

const getMemberships = cache(async (): Promise<RequestMembership[]> => {
  const { supabase, user } = await getSessionUser();
  if (!user) return [];

  const { data } = await supabase
    .from("vendor_members")
    .select("role, vendor:vendors(id, name, slug, status)")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });

  return data ?? [];
});

export type RequestContext = {
  supabase: ServerClient;
  user: User | null;
  profile: RequestProfile | null;
  memberships: RequestMembership[];
  isPlatformAdmin: boolean;
};

/**
 * Loads the request's verified identity, admin flag and vendor memberships once.
 * Clients can only read data their RLS policies allow; no identity is accepted
 * from the caller.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const { supabase, user } = await getSessionUser();

  if (!user) {
    return {
      supabase,
      user,
      profile: null,
      memberships: [],
      isPlatformAdmin: false,
    };
  }

  const [profile, memberships] = await Promise.all([
    getProfile(),
    getMemberships(),
  ]);

  return {
    supabase,
    user,
    profile,
    memberships,
    isPlatformAdmin: profile?.is_platform_admin ?? false,
  };
});

/**
 * Verifies the session on the server and redirects anonymous visitors to the
 * sign-in page. Never trust client-supplied user ids or roles — identity comes
 * from the verified Supabase session only.
 *
 * Pass `verifyWithAuthServer` from Server Actions (writes) to also confirm with
 * the Auth server that the session has not been revoked.
 */
export async function requireUser(
  options: { verifyWithAuthServer?: boolean } = {},
): Promise<{
  supabase: ServerClient;
  user: User;
}> {
  const { supabase, user } = await getSessionUser();

  if (!user) redirect("/login");
  if (options.verifyWithAuthServer) await assertSessionStillValid();

  return { supabase, user };
}

/**
 * Verifies the session (confirmed with the Auth server), AND an explicitly
 * granted platform-admin flag. The profile row is still protected by RLS plus
 * the self-elevation guard trigger in the database, so this is server-side
 * defense in depth — not the only control.
 */
export async function requirePlatformAdmin(): Promise<{
  supabase: ServerClient;
  user: User;
}> {
  const { supabase, user } = await getSessionUser();

  if (!user) redirect("/login");

  const [, profile] = await Promise.all([
    assertSessionStillValid(),
    getProfile(),
  ]);

  if (!profile?.is_platform_admin) redirect("/");

  return { supabase, user };
}

export type { Database };
