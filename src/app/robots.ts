import type { MetadataRoute } from "next";

import { isIndexingEnabled } from "@/lib/indexing";
import { getSiteUrl } from "@/lib/site-url";

const PRIVATE_PREFIXES = [
  "/admin/",
  "/vendor/",
  "/account/",
  "/orders/",
  "/login",
  "/signup",
  "/cart",
  "/checkout",
  "/api/",
  "/search",
];

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl({ fallbackToProductionOnLocalhost: true });

  if (!isIndexingEnabled()) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      host: siteUrl,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PREFIXES,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
