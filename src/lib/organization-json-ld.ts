import { getSiteUrl } from "@/lib/site-url";

/**
 * schema.org Organization for the marketplace itself (P1-16, L-16).
 * Only facts that are actually public today: the name and the site URL.
 * There is no logo file and no published contact/entity details (P0-06
 * kept the legal pages as drafts without company details), so those
 * fields are omitted rather than invented.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Gifto",
    url: getSiteUrl({ fallbackToProductionOnLocalhost: true }),
  };
}
