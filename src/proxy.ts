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

const PROTECTED_PREFIXES = ["/account", "/admin", "/vendor", "/checkout"];
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

  // Expose a safe flag for server-side route guards / UI only.
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
