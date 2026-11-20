"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { CloseIcon, SearchIcon } from "@/components/icons";
import { OccasionEmpty } from "@/components/occasion-empty";
import { OccasionTile } from "@/components/occasion-tile";
import type { CatalogOccasion } from "@/lib/catalog";
import { occasionDisplayName } from "@/lib/occasion-display";

export function OccasionBrowser({
  occasions,
}: {
  occasions: CatalogOccasion[];
}) {
  const t = useTranslations("occasions");
  const [query, setQuery] = useState("");
  const inputId = useId();
  const resultsId = useId();

  const trimmedQuery = query.trim();
  const visibleOccasions = useMemo(() => {
    const needle = trimmedQuery.toLocaleLowerCase();
    if (!needle) return occasions;

    return occasions.filter((occasion) =>
      `${occasionDisplayName(occasion.slug, occasion.name)} ${occasion.description ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [occasions, trimmedQuery]);

  const countLabel =
    visibleOccasions.length === occasions.length
      ? t("countAll", { total: occasions.length })
      : t("countFiltered", {
          visible: visibleOccasions.length,
          total: occasions.length,
        });

  return (
    <section aria-labelledby="occasion-collection-heading">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            id="occasion-collection-heading"
            className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-berry"
          >
            {t("collectionHeading")}
          </p>
          <p aria-live="polite" className="mt-1 text-sm text-ink-mute">
            {countLabel}
          </p>
        </div>

        <div role="search" className="relative w-full sm:max-w-xs">
          <label htmlFor={inputId} className="sr-only">
            {t("searchLabel")}
          </label>
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            aria-controls={resultsId}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full appearance-none rounded-full border border-line bg-paper-soft/90 ps-11 pe-14 text-base text-ink placeholder:text-ink-mute shadow-[0_12px_28px_-26px_rgba(121,13,43,0.55)] transition-colors focus:border-berry/40 focus:bg-paper focus:outline-none focus:ring-2 focus:ring-berry/15 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clearSearchLabel")}
              className="absolute end-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-berry-soft hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {visibleOccasions.length > 0 ? (
        <div
          id={resultsId}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {visibleOccasions.map((occasion, index) => (
            <OccasionTile
              key={occasion.id}
              occasion={occasion}
              index={index}
            />
          ))}
        </div>
      ) : (
        <div id={resultsId}>
          <OccasionEmpty
            title={t("noMatchTitle", { query: trimmedQuery })}
            description={t("noMatchBody")}
            action={
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-berry px-5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
              >
                {t("clearSearch")}
              </button>
            }
          />
        </div>
      )}
    </section>
  );
}
