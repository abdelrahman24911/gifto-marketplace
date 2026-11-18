import type { MetadataRoute } from "next";

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
