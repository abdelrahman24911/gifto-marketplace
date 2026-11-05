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
 * action, so the verified session, profile and memberships are shared between
 * the header and page guards without ever leaking between requests or users.
 */
const getVerifiedUser = cache(
  async (): Promise<{ supabase: ServerClient; user: User | null }> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return { supabase, user };
  },
);

const getProfile = cache(async (): Promise<RequestProfile | null> => {
  const { supabase, user } = await getVerifiedUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  return data;
});

const getMemberships = cache(async (): Promise<RequestMembership[]> => {
  const { supabase, user } = await getVerifiedUser();
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
  const { supabase, user } = await getVerifiedUser();

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
 */
export async function requireUser(): Promise<{
  supabase: ServerClient;
  user: User;
}> {
  const { supabase, user } = await getVerifiedUser();

  if (!user) redirect("/login");

  return { supabase, user };
}

/**
 * Verifies both the session AND an explicitly granted platform-admin flag.
 * The profile row is still protected by RLS plus the self-elevation guard
 * trigger in the database, so this is server-side defense in depth — not the
 * only control.
 */
export async function requirePlatformAdmin(): Promise<{
  supabase: ServerClient;
  user: User;
}> {
  const { supabase, user } = await getVerifiedUser();

  if (!user) redirect("/login");

  const profile = await getProfile();

  if (!profile?.is_platform_admin) redirect("/");

  return { supabase, user };
}

export type { Database };
