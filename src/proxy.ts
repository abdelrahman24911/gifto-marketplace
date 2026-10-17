import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the Supabase auth cookies fresh on every request (Next 16 `proxy`
 * convention — the `middleware` file convention is deprecated).
 *
 * Phase 1 does not protect any routes yet (auth UI is a later phase), so this
 * only refreshes the session. Route guards will be added when login/account
 * pages exist, and will be enforced server-side — never by UI hiding.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not run logic between createServerClient and getUser() — a side effect
  // here could trigger an unnecessary token refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Expose a safe flag for future server-side route guards / UI only.
  if (user) {
    supabaseResponse.headers.set("x-gifto-auth", "1");
  } else {
    supabaseResponse.headers.delete("x-gifto-auth");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Skip Next.js internals and all static files, but keep auth cookie
     * refresh running for pages and API routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
