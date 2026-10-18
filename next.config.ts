import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // `cacheComponents` (experimental static-shell rendering) is disabled: this
  // app is fully dynamic — the root layout reads the auth session via cookies()
  // and every page queries the database — so there is no static shell to
  // prerender, and the flag forbids the `dynamic = "force-dynamic"` segment
  // config we need to mark routes dynamic at build time.
  cacheComponents: false,
  // `partialPrefetching` requires `cacheComponents`, so it is disabled alongside
  // it. Enable both only if this app ever gains meaningfully static routes.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
