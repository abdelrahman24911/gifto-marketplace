import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Anonymous Supabase client for PUBLIC catalog reads that are shared across
 * requests (see `catalog-cache.ts`).
 *
 * It deliberately has no cookies, no session and no service-role key: it can
 * only ever see what the `anon` role may read under RLS, so a result cached
 * from it can never contain one user's private data. Do not use it for
 * anything that depends on who is signed in.
 */
export function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
