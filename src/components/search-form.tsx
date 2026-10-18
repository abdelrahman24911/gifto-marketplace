"use client";

import { SearchIcon } from "@/components/icons";

/**
 * Storefront search. A plain GET form — it works without JavaScript and lands
 * on the real /search route, which queries the products table server-side.
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
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className={`group relative flex items-center ${className}`}
    >
      <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-ink-mute" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder="Search gifts…"
        aria-label="Search gifts"
        className="h-10 w-full rounded-full border border-line bg-paper-soft pl-9 pr-3 text-sm text-ink placeholder:text-ink-mute transition-colors focus:border-berry/50 focus:outline-none focus:ring-2 focus:ring-berry/20"
      />
    </form>
  );
}
