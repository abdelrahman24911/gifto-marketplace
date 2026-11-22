"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import { LOCALE_DIRECTIONS, type AppLocale } from "@/i18n/routing";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function localeFromPathname(pathname: string | null): AppLocale {
  return /^\/ar(\/|$)/.test(pathname ?? "") ? "ar" : "en";
}

/**
 * Keeps `<html lang>` and `<html dir>` in sync after client-side locale
 * navigation. The root layout owns the `<html>` tag because admin and vendor
 * share it, so React does not re-render that layout when the `[locale]`
 * segment changes. Without this, switching to Arabic would leave the page
 * `dir="ltr"` (and the Latin font) until a full refresh.
 */
export function LocaleHtmlSync() {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);

  useIsomorphicLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = LOCALE_DIRECTIONS[locale];
  }, [locale]);

  return null;
}
