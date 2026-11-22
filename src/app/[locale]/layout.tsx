import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Locale layout for the localised routes (P1-10, H-15): the storefront and
 * auth pages. Vendor and admin stay outside the `[locale]` segment and
 * render English only.
 *
 * The `<html>` tag itself lives in the root layout, which reads the locale
 * with `getLocale()` (resolved from the middleware's `X-NEXT-INTL-LOCALE`
 * header) and sets `lang`/`dir` there. This layout only validates the
 * locale, pins it for static rendering, and provides the messages to
 * client components.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return children;
}
