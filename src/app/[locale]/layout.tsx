import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
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
 * header) and sets `lang`/`dir` there. This layout validates the locale,
 * pins it for static rendering, and provides that locale's messages to the
 * client components below it. The provider is repeated here (it also exists
 * in the root layout for admin/vendor) because the root layout is not
 * re-rendered on client-side locale switches: this one re-renders with the
 * `[locale]` param, so client labels and links follow the new language
 * without a full refresh.
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
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
