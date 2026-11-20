import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation for routes inside the `[locale]` segment.
 * `Link`, `redirect`, `permanentRedirect`, `usePathname` and `useRouter`
 * keep the current locale
 * (e.g. `/ar/shops/…` stays Arabic); the default locale stays prefix-free.
 *
 * Do NOT use these for /admin, /vendor or /api — those routes are outside
 * the `[locale]` segment and must keep plain next/link and next/navigation.
 * `GuardedLink` (navigation-guard) stays on plain next/link for the same
 * reason: it is also rendered in admin/vendor, where no intl provider
 * exists; it prefixes localised hrefs itself from the current pathname.
 */
export const {
  Link,
  redirect,
  permanentRedirect,
  usePathname,
  useRouter,
  getPathname,
} = createNavigation(routing);
