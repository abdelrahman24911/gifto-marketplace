"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

/**
 * Language switcher for the storefront header. Links to the same page in
 * the other locale (next-intl's `locale` prop keeps the path and swaps the
 * prefix); the proxy redirects `/en/…` back to the unprefixed URL, so the
 * English link always lands on the canonical bare path.
 */
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();

  const target: AppLocale = locale === "ar" ? "en" : "ar";
  const label = target === "ar" ? t("arabic") : t("english");

  return (
    <Link
      href={pathname}
      locale={target}
      className={`inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-berry-soft hover:text-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry ${className}`}
      aria-label={`${t("language")}: ${label}`}
    >
      {label}
    </Link>
  );
}
