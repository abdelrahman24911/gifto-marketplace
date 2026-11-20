import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";

import { routing } from "./routing";

/**
 * Request-scoped locale and messages for Server Components.
 *
 * The locale comes from the `X-NEXT-INTL-LOCALE` header the middleware sets
 * (or the `[locale]` segment); anything unrecognised falls back to the
 * default locale instead of 404ing. Messages live in `messages/<locale>.json`
 * and are split by namespace per area (common, home, product, cart,
 * checkout, order).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
