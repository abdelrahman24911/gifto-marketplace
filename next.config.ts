import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl request config (locale + messages per request, P1-10).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Optimized images may only come from this project's PUBLIC storage objects.
// Derived from the environment (never hardcoded); no host is allowed if the
// URL is missing or invalid.
function supabaseUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function supabaseImagePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const url = supabaseUrl();
  if (!url) return [];

  return [
    {
      protocol: url.protocol === "http:" ? "http" : "https",
      hostname: url.hostname,
      port: url.port,
      pathname: "/storage/v1/object/public/**",
    },
  ];
}

/**
 * Enforced Content-Security-Policy (P1-11, H-11).
 *
 * The policy itself is built per request in `src/proxy.ts`, where a fresh
 * nonce is generated: Next.js extracts the nonce from the `x-nonce` /
 * `Content-Security-Policy` request headers and applies it to its inline
 * scripts, and the proxy sets the same policy (with the same nonce) on the
 * response. It cannot live in `headers()` here — those values are static
 * per build and a nonce must be unique per request.
 *
 * Directives (see `contentSecurityPolicy()` in the proxy):
 * - script-src 'self' + per-request nonce + 'strict-dynamic'; NO
 *   'unsafe-inline' for scripts. The only app-authored inline script is
 *   the product JSON-LD block, which reads the nonce from `x-nonce`.
 * - style-src keeps 'self' 'unsafe-inline': the bar-chart and analytics
 *   bars set data-driven widths/heights via React `style` attributes,
 *   and style attributes cannot take a nonce — only `unsafe-inline`
 *   allowlists them. This is deliberate and scoped to styles only.
 * - img-src / connect-src list the configured Supabase origin explicitly
 *   (from env, never hardcoded); no host is allowed if it is missing.
 * - No wildcard source anywhere.
 *
 * Strict-Transport-Security: `max-age=31536000; includeSubDomains`.
 * No `preload`: that is only added after HTTPS is confirmed on every
 * subdomain (not confirmed — see docs/HOSTED_STATE.md).
 */
const baselineSecurityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseImagePatterns(),
    formats: ["image/avif", "image/webp"],
    // Uploaded files get a fresh UUID path (upsert is off), so a URL never
    // changes content and optimized copies can be kept for a long time.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
  /* config options here */
  // `cacheComponents` (experimental static-shell rendering) is disabled: this
  // app is fully dynamic — the root layout reads the auth session via cookies()
  // and every page queries the database — so there is no static shell to
  // prerender, and the flag forbids the `dynamic = "force-dynamic"` segment
  // config we need to mark routes dynamic at build time.
  cacheComponents: false,
  // `partialPrefetching` requires `cacheComponents`, so it is disabled alongside
  // it. Enable both only if this app ever gains meaningfully static routes.
  // Guest confirmation pages are token-gated: keep their URLs out of referrers,
  // search indexes and shared caches. The token itself lives in an HttpOnly
  // cookie, never in the address bar.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: baselineSecurityHeaders,
      },
      {
        source: "/orders/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/:locale(ar|en)/orders/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
