import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the Supabase auth cookies fresh on every request (Next 16 `proxy`
 * convention — the `middleware` file convention is deprecated) and redirects
 * anonymous visitors away from authenticated-only areas.
 *
 * Route guards here are a convenience layer only. Each protected page still
 * verifies the session server-side, and all data access is enforced by Row
 * Level Security — UI/route hiding is never the security boundary.
 */

// `/checkout` is intentionally public: guests can place COD orders without an
// Auth account. Authenticated checkout still branches on the verified session
// inside the page and Server Action.
const PROTECTED_PREFIXES = ["/account", "/admin", "/vendor"];
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

  // Do not run logic between createServerClient and getClaims() — a side effect
  // here could trigger an unnecessary token refresh.
  //
  // getClaims() verifies the access token's signature/expiry locally against the
  // cached JWKS (no Auth-server round trip) and still refreshes an expired
  // session. This guard is a convenience layer; pages re-check the session and
  // Server Actions/admin pages additionally confirm it with the Auth server.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  // Route guards. This is convenience only: every protected page ALSO verifies
  // the session server-side, and data access is enforced by RLS regardless.
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search || ""}`,
    );

    const redirectResponse = NextResponse.redirect(url);
    // Carry any cookies refreshed above onto the redirect.
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
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
