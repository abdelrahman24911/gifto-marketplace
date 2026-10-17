import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";

/**
 * Server-side Supabase client for Server Components, Server Actions and Route
 * Handlers. Reads/writes auth cookies via the request-scoped cookie store, so
 * every request gets a fresh, per-user client — never a shared/global one.
 *
 * Uses only the public URL + anon key. Data access is still enforced by RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // The setAll method was called from a Server Component. The proxy
            // refreshes cookies for incoming requests, so this is safe to ignore.
          }
        },
      },
    },
  );
}
