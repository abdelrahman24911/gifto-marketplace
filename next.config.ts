import type { NextConfig } from "next";

// Optimized images may only come from this project's PUBLIC storage objects.
// Derived from the environment (never hardcoded); no host is allowed if the
// URL is missing or invalid.
function supabaseImagePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];

  try {
    const url = new URL(raw);
    return [
      {
        protocol: url.protocol === "http:" ? "http" : "https",
        hostname: url.hostname,
        port: url.port,
        pathname: "/storage/v1/object/public/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
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
