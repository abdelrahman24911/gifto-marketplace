import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Keeps the Supabase auth cookies fresh on every request (Next 16 `proxy`
 * convention — the `middleware` file convention is deprecated) and redirects
 * anonymous visitors away from authenticated-only areas. Also runs the
 * next-intl locale routing for the localised routes (P1-10, H-15).
 *
 * Route guards here are a convenience layer only. Each protected page still
 * verifies the session server-side, and all data access is enforced by Row
 * Level Security — UI/route hiding is never the security boundary.
 */

// `/checkout` is intentionally public: guests can place COD orders without an
// Auth account. Authenticated checkout still branches on the verified session
// inside the page and Server Action.
const PROTECTED_PREFIXES = ["/account", "/admin", "/vendor"];

// Routes that live under the `[locale]` segment (storefront + auth).
// Vendor, admin, /auth/* callbacks and API routes are NOT localised and
// never reach the intl middleware, so their URLs are untouched.
const LOCALIZED_PREFIXES = [
  "/shops",
  "/categories",
  "/occasions",
  "/search",
  "/cart",
  "/checkout",
  "/account",
  "/orders",
  "/contact",
  "/help",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/delivery-returns",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

function isLocalizedPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (/^\/(ar|en)(\/|$)/.test(pathname)) return true;
  return LOCALIZED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
}

function localePrefix(pathname: string): string {
  const match = /^\/(ar|en)(?=\/|$)/.exec(pathname);
  return match ? `/${match[1]}` : "";
}

const intlMiddleware = createIntlMiddleware(routing);

// P1-11 (H-11): enforced CSP with a per-request nonce.
//
// Next.js extracts the nonce from the `Content-Security-Policy` request
// header during rendering and applies it to its inline scripts and bundles
// (see the bundled Next CSP docs in node_modules/next/dist/docs). The proxy
// therefore sets the same policy — with the same nonce — on the request
// (`x-nonce` for app code that needs it, e.g. the product JSON-LD block)
// and on every response it returns. A fresh nonce is generated on each
// invocation, including the internal rewrite re-dispatch: the render always
// uses the latest run's nonce, and the response carries that same nonce.
//
// Directives:
// - script-src 'self' + nonce + 'strict-dynamic'; NO 'unsafe-inline'.
//   Next's inline bootstrap scripts get the nonce automatically; the only
//   app-authored inline script (product JSON-LD) reads it from `x-nonce`.
// - style-src keeps 'self' 'unsafe-inline': the bar-chart and analytics
//   bars set data-driven widths/heights via React `style` attributes, and
//   style attributes cannot take a nonce. Deliberate, styles only.
// - img-src / connect-src list the configured Supabase origin explicitly
//   (env-derived, never hardcoded); no host is allowed if it is missing.
// - No wildcard source anywhere. HSTS lives in next.config.ts (static).
function supabaseOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function contentSecurityPolicy(nonce: string): string {
  const supabase = supabaseOrigin();
  const supabaseSource = supabase ? ` ${supabase}` : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self'${supabaseSource}`,
    "font-src 'self'",
    `connect-src 'self'${supabaseSource}`,
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Enforced CSP (P1-11): fresh nonce per request, set on the request so
  // Next.js can apply it during rendering, and on every response below.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const applyCsp = (response: NextResponse): NextResponse => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  // 1. Supabase session refresh + route guards. The guard sees the path
  // without its locale prefix and the /login target keeps the locale so an
  // Arabic visitor returns to the Arabic page.
  //
  // This runs first so that a locale rewrite/redirect below can carry the
  // refreshed auth cookies with it. Route guards are a convenience layer
  // only: each protected page still verifies the session server-side, and
  // all data access is enforced by Row Level Security.
  const barePathname = stripLocalePrefix(pathname);
  const prefix = localePrefix(pathname);

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
  const isProtected = PROTECTED_PREFIXES.some(
    (protectedPrefix) =>
      barePathname === protectedPrefix ||
      barePathname.startsWith(`${protectedPrefix}/`),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/login`;
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
    return applyCsp(redirectResponse);
  }

  // 2. Locale routing for localised routes only. With
  // `localePrefix: "as-needed"` a bare storefront path is rewritten
  // internally to `/en/…` (URL unchanged) and an Arabic path stays `/ar/…`.
  //
  // A rewrite or redirect response must be returned AS-IS: copying its
  // `x-middleware-rewrite` header onto a `NextResponse.next()` response
  // gives the server both signals at once and it answers with a 307 to the
  // original path (self-redirect loop). Refreshed auth cookies are merged
  // onto the intl response instead. Only when intl returns `next()` are
  // its `x-middleware-*` headers (the `X-NEXT-INTL-LOCALE` request header
  // the root layout reads) merged onto the Supabase response.
  //
  // Next re-runs the proxy for the rewritten URL, so a bare-path rewrite
  // (`/shops` → `/en/shops`) is followed by a second invocation for
  // `/en/shops` — and intl would redirect that back to `/shops`, an
  // infinite loop. The second invocation is recognisable because the
  // first run's rewrite response set the `X-NEXT-INTL-LOCALE` request
  // header on the re-dispatched request (a browser never sends it), so
  // skip intl there and let the rewritten page render. A direct browser
  // request to `/en/shops` has no such header and still gets the
  // canonical redirect to `/shops`.
  const isInternalRewriteRedispatch =
    request.headers.get("x-next-intl-locale") !== null &&
    /^\/(ar|en)(\/|$)/.test(pathname);
  if (isLocalizedPath(pathname) && !isInternalRewriteRedispatch) {
    const intlResponse = intlMiddleware(request);
    const isRewriteOrRedirect =
      intlResponse.headers.has("x-middleware-rewrite") ||
      intlResponse.headers.has("location");
    if (isRewriteOrRedirect) {
      for (const cookie of supabaseResponse.cookies.getAll()) {
        intlResponse.cookies.set(cookie);
      }
      return applyCsp(intlResponse);
    }
    for (const [key, value] of intlResponse.headers.entries()) {
      if (key.toLowerCase().startsWith("x-middleware-")) {
        supabaseResponse.headers.set(key, value);
      }
    }
    for (const cookie of intlResponse.cookies.getAll()) {
      supabaseResponse.cookies.set(cookie);
    }
  }

  return applyCsp(supabaseResponse);
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
