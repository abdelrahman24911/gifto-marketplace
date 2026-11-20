"use client";

import { useLocale, useTranslations } from "next-intl";

import { SearchIcon } from "@/components/icons";
import { useGuardedNavigation } from "@/components/navigation-guard";
import { useRouter } from "@/i18n/navigation";

/**
 * Storefront search. A plain GET form — it works without JavaScript and lands
 * on the real /search route, which queries the products table server-side.
 * The form action and the dirty-guard navigation both stay in the current
 * locale: a bare `/search` submitted from an Arabic page would otherwise
 * render the English search page.
 */
export function SearchForm({
  defaultValue = "",
  autoFocus = false,
  className = "",
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { isDirty, requestNavigation } = useGuardedNavigation();

  const action = locale === "ar" ? "/ar/search" : "/search";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!isDirty()) return;

    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "");
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const href = params.size > 0 ? `/search?${params.toString()}` : "/search";
    requestNavigation(() => router.push(href));
  }

  return (
    <form
      action={action}
      method="get"
      role="search"
      onSubmit={handleSubmit}
      className={`group relative flex items-center ${className}`}
    >
      <SearchIcon className="pointer-events-none absolute start-3 h-4 w-4 text-ink-mute" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder={t("searchPlaceholder")}
        aria-label={t("search")}
        className="h-10 w-full rounded-full border border-line bg-paper-soft pe-3 ps-9 text-sm text-ink placeholder:text-ink-mute transition-colors focus:border-berry/50 focus:outline-none focus:ring-2 focus:ring-berry/20"
      />
    </form>
  );
}
