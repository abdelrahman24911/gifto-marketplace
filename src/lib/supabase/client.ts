import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/**
 * Browser-side Supabase client.
 *
 * Uses only the public URL and anon key (both safe to expose to the browser).
 * All access is still constrained by Row Level Security — the anon key is not
 * privileged. Never import the service-role client into this module.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
