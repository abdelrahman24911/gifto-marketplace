import { defineRouting } from "next-intl/routing";

/**
 * Locales for the storefront's first Arabic slice (P1-10, H-15).
 *
 * English is the default locale and keeps prefix-free URLs
 * (`localePrefix: "as-needed"`), so no English URL changes. Arabic lives
 * under `/ar/…`. Only the storefront and auth routes are localised — vendor
 * and admin stay English-only and are outside the `[locale]` segment.
 */
export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];

export const LOCALE_DIRECTIONS: Record<AppLocale, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
};
