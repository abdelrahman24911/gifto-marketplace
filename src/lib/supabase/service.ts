import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Server-only Supabase client authenticated with the service-role key.
 *
 * Bypasses Row Level Security — never import this from client components, and
 * never use it where a session-scoped client (`./server`) would do. Intended
 * for bootstrapping and platform operations that must not be constrained by
 * a user's policies.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
