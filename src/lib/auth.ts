import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import type { Database } from "@/lib/supabase/database.types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type User = { id: string; email?: string };

/**
 * Verifies the session on the server and redirects anonymous visitors to the
 * sign-in page. Never trust client-supplied user ids or roles — identity comes
 * from the verified Supabase session only.
 */
export async function requireUser(): Promise<{
  supabase: ServerClient;
  user: User;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_platform_admin) redirect("/");

  return { supabase, user };
}

export type { Database };
