import type { NextConfig } from "next";

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
 * Report-Only baseline CSP.
 *
 * Remote sources are intentionally limited to the configured Supabase project
 * origin. The browser auth client needs it in `connect-src`; direct public
 * storage images need it in `img-src`. Fonts are self-hosted by next/font.
 * There are no analytics, ads, embeds, media, or other third-party origins.
 *
 * `'unsafe-inline'` is required for Next.js inline bootstrap scripts and the
 * inline style attributes used by the vendor analytics charts. It is
 * documented here for the eventual enforcement phase; removing it requires a
 * nonce/hash strategy plus re-testing auth, navigation, and charts.
 */
function contentSecurityPolicyReportOnly(): string {
  const supabase = supabaseUrl();
  const supabaseSource = supabase ? ` ${supabase.origin}` : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self'${supabaseSource}`,
    "font-src 'self'",
    `connect-src 'self'${supabaseSource}`,
  ].join("; ");
}

const baselineSecurityHeaders = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicyReportOnly(),
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
    ];
  },
};

export default nextConfig;
