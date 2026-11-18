"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ChevronDownIcon, SparkleIcon } from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/ui/section";
import {
  GIFT_FINDER_BUDGET_OPTIONS,
  GIFT_FINDER_PAGE_SIZE,
  GIFT_FINDER_RECIPIENTS,
  type GiftFinderBudgetId,
  type GiftFinderPage,
  type GiftFinderRecipientId,
  type GiftFinderSelection,
} from "@/lib/gift-finder";
import { toQuickAddItem } from "@/lib/quick-add";

const selectClass =
  "h-11 w-full appearance-none rounded-xl border border-line bg-paper pl-3 pr-9 text-sm font-normal normal-case tracking-normal text-ink transition-colors focus:border-berry/50 focus:outline-none focus:ring-2 focus:ring-berry/20";

const labelClass =
  "flex flex-col gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute";

const DEFAULT_SELECTION: GiftFinderSelection = {
  recipient: "any",
  occasionSlug: null,
  budget: "any",
};

type LoadError = {
  offset: number;
  append: boolean;
};

export function GiftFinder({
  initialPage,
  occasions,
}: {
  initialPage: GiftFinderPage;
  occasions: { name: string; slug: string }[];
}) {
  const [selection, setSelection] =
    useState<GiftFinderSelection>(DEFAULT_SELECTION);
  const [page, setPage] = useState<GiftFinderPage | null>(initialPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const formId = useId();
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const focusSummaryRef = useRef(false);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (loading || !focusSummaryRef.current) return;

    focusSummaryRef.current = false;
    summaryRef.current?.focus({ preventScroll: true });
  }, [loading, page]);

  async function loadPage(
    nextSelection: GiftFinderSelection,
    offset: number,
    append: boolean,
  ) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      recipient: nextSelection.recipient,
      budget: nextSelection.budget,
      offset: String(offset),
      limit: String(GIFT_FINDER_PAGE_SIZE),
    });
    if (nextSelection.occasionSlug) {
      params.set("occasion", nextSelection.occasionSlug);
    }

    try {
      const response = await fetch(`/api/gift-finder?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Gift Finder request failed");

      const data = (await response.json()) as GiftFinderPage;
      if (requestId !== requestIdRef.current) return;

      if (append) {
        setPage((current) =>
          current
            ? {
                ...data,
                offset: current.offset,
                products: [...current.products, ...data.products],
              }
            : data,
        );
        if (!data.hasMore) focusSummaryRef.current = true;
      } else {
        setPage(data);
      }
    } catch {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }
      if (!append) setPage(null);
      setError({ offset, append });
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  function choose(patch: Partial<GiftFinderSelection>) {
    const nextSelection = { ...selection, ...patch };
    setSelection(nextSelection);
    setError(null);
    void loadPage(nextSelection, 0, false);
  }

  function reset() {
    setSelection(DEFAULT_SELECTION);
    setError(null);
    void loadPage(DEFAULT_SELECTION, 0, false);
  }

  function retry() {
    void loadPage(
      selection,
      error?.offset ?? page?.offset ?? 0,
      error?.append ?? false,
    );
  }

  const hasFilters =
    selection.recipient !== "any" ||
    selection.occasionSlug !== null ||
    selection.budget !== "any";
  const total = page?.total ?? 0;
  const showing = page?.products.length ?? 0;

  return (
    <div>
      <div className="grid gap-8 rounded-[2rem] border border-line bg-paper p-6 shadow-[0_26px_70px_-58px_oklch(0.33_0.13_12/0.6)] sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-berry-soft px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-berry-deep">
            <SparkleIcon className="h-3.5 w-3.5" />
            Three quick choices
          </p>
          <h3 className="mt-5 font-display text-3xl leading-tight text-ink sm:text-4xl">
            A thoughtful gift, without the endless scroll.
          </h3>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-soft">
            Tell us who it&apos;s for, the moment, and what you&apos;d like to
            spend. We&apos;ll narrow the real Gifto catalogue to gifts that fit.
          </p>
          <p className="mt-6 text-xs leading-relaxed text-ink-mute">
            Matches update as you choose. These are real products from real
            shops — never generated suggestions.
          </p>
        </div>

        <form
          aria-label="Gift Finder filters"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelClass} htmlFor={`${formId}-recipient`}>
              Who is it for?
              <span className="relative">
                <select
                  id={`${formId}-recipient`}
                  aria-controls={`${formId}-results`}
                  value={selection.recipient}
                  onChange={(event) =>
                    choose({
                      recipient: event.target.value as GiftFinderRecipientId,
                    })
                  }
                  className={selectClass}
                >
                  {GIFT_FINDER_RECIPIENTS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              </span>
            </label>

            <label className={labelClass} htmlFor={`${formId}-occasion`}>
              What&apos;s the moment?
              <span className="relative">
                <select
                  id={`${formId}-occasion`}
                  aria-controls={`${formId}-results`}
                  value={selection.occasionSlug ?? ""}
                  onChange={(event) =>
                    choose({ occasionSlug: event.target.value || null })
                  }
                  className={selectClass}
                >
                  <option value="">Any occasion</option>
                  {occasions.map((occasion) => (
                    <option key={occasion.slug} value={occasion.slug}>
                      {occasion.name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              </span>
            </label>

            <label className={labelClass} htmlFor={`${formId}-budget`}>
              What&apos;s your budget?
              <span className="relative">
                <select
                  id={`${formId}-budget`}
                  aria-controls={`${formId}-results`}
                  value={selection.budget}
                  onChange={(event) =>
                    choose({ budget: event.target.value as GiftFinderBudgetId })
                  }
                  className={selectClass}
                >
                  {GIFT_FINDER_BUDGET_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              </span>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-ink-mute">
              No account needed to browse.
            </p>
            <button
              type="button"
              onClick={reset}
              disabled={!hasFilters}
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-berry/40 hover:text-berry disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            >
              Clear choices
            </button>
          </div>
        </form>
      </div>

      <div
        id={`${formId}-results`}
        aria-busy={loading}
        className="mt-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p
            ref={summaryRef}
            tabIndex={-1}
            aria-live="polite"
            className="font-display text-2xl text-ink focus:outline-none"
          >
            {loading
              ? "Updating matches…"
              : total === 1
                ? "1 gift"
                : `${total} gifts`}{" "}
            <span className="ml-2 font-sans text-sm font-normal text-ink-mute">
              {loading
                ? "checking the catalogue"
                : hasFilters
                  ? "match your choices"
                  : "ready to explore"}
              {!loading && page?.hasMore
                ? ` · showing ${showing} of ${total}`
                : ""}
            </span>
          </p>
          <p className="text-xs text-ink-mute">
            Prices and stock are confirmed at checkout.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-berry/25 bg-berry-soft/60 px-4 py-3 text-sm text-berry-deep"
          >
            <span>
              {error.append
                ? "We couldn't load more gifts. Your current results are unchanged."
                : "We couldn't update the matches. Try again."}
            </span>
            <button
              type="button"
              onClick={retry}
              className="rounded-full border border-berry/30 px-4 py-1.5 text-sm font-semibold transition-colors hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!page && loading ? (
          <p className="mt-5 text-sm text-ink-mute">Finding gifts…</p>
        ) : null}

        {page && total > 0 ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {page.products.map((product) => {
                const item = toQuickAddItem(product);

                return (
                  <ProductCard
                    key={product.id}
                    href={`/shops/${product.vendorSlug}/${product.slug}`}
                    name={product.name}
                    priceMinor={product.priceMinor}
                    stock={product.stock}
                    imagePath={product.imagePath}
                    imageAlt={product.imageAlt}
                    vendorName={product.vendorName}
                    categoryName={product.categoryName}
                    quickAdd={
                      item
                        ? {
                            item,
                            acceptingOrders:
                              product.vendorIsAcceptingOrders,
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
            {page.hasMore ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    void loadPage(
                      selection,
                      page.offset + page.products.length,
                      true,
                    )
                  }
                  disabled={loading}
                  className="inline-flex h-11 items-center rounded-full border border-line-strong bg-paper px-5 text-sm font-semibold text-ink transition-colors hover:border-berry/40 hover:text-berry disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                >
                  {loading ? "Loading more…" : "Show more gifts"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {page && total === 0 && !loading ? (
          <div className="mt-5">
            <EmptyState
              title={
                page.occasionUnsupported
                  ? "Gift Finder doesn't cover this moment yet"
                  : "No gifts match those choices yet"
              }
            >
              {page.occasionUnsupported
                ? "Try another occasion, or browse the full collection below."
                : "Try a wider budget or another recipient — or browse all gifts."}
            </EmptyState>
            <div className="mt-4 text-center">
              <GuardedLink
                href="/search"
                className="text-sm font-medium text-berry transition-colors hover:text-berry-deep"
              >
                Browse all gifts
              </GuardedLink>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
