import { routing, type AppLocale } from "@/i18n/routing";

/**
 * Locale-aware path helpers for components (server and client). The proxy
 * (`src/proxy.ts`) keeps its own copies so the request pipeline never
 * depends on this module.
 *
 * English is the default locale and has no URL prefix
 * (`localePrefix: "as-needed"`); Arabic lives under `/ar/…`.
 */

/** Routes that live under the `[locale]` segment (storefront + auth). */
export const LOCALIZED_PREFIXES = [
  "/shops",
  "/categories",
  "/occasions",
  "/search",
  "/cart",
  "/checkout",
  "/wishlist",
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
] as const;

export function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
}

export function pathnameLocale(pathname: string): AppLocale | null {
  const match = /^\/(ar|en)(?=\/|$)/.exec(pathname);
  return match ? (match[1] as AppLocale) : null;
}

function isLocalizedHrefPath(path: string): boolean {
  if (path === "/") return true;
  return LOCALIZED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Prefix a localised href with the locale of the current page. Non-localised
 * hrefs (admin, vendor, /auth callbacks, API routes), hash-only hrefs and
 * external URLs are returned unchanged. The default locale (`en`) never
 * gets a prefix.
 */
export function localizeHref(href: string, pathname: string): string {
  const locale = pathnameLocale(pathname);
  if (locale !== "ar") return href;
  if (href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href;

  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  let end = href.length;
  if (hashIndex !== -1) end = Math.min(end, hashIndex);
  if (queryIndex !== -1) end = Math.min(end, queryIndex);
  const path = href.slice(0, end);
  const suffix = href.slice(end);

  if (!isLocalizedHrefPath(path)) return href;
  if (path === "/") return `/ar${suffix}`;
  return `/ar${path}${suffix}`;
}

export function localePrefixFor(locale: AppLocale): string {
  return locale === routing.defaultLocale ? "" : `/${locale}`;
}
