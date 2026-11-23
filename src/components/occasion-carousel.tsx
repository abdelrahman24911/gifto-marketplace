"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { OccasionTile } from "@/components/occasion-tile";
import { SectionHeading } from "@/components/ui/section";
import type { CatalogOccasion } from "@/lib/catalog";
import { carouselDirection, carouselEdges } from "@/lib/carousel";

type OccasionCarouselProps = {
  occasions: CatalogOccasion[];
  eyebrow?: string;
  title?: string;
  description?: string;
  exploreHref?: string;
  exploreLabel?: string;
  /** Optional toolbar (for example the occasions-page search) shown with the arrows. */
  toolbar?: ReactNode;
  className?: string;
};

/**
 * Horizontal, scroll-snapping occasion rail shared by the homepage and the
 * occasions page. Desktop gets prev/next buttons; touch devices scroll
 * natively. RTL scroll offsets are handled explicitly because browsers report
 * a negative `scrollLeft` there.
 */
export function OccasionCarousel({
  occasions,
  eyebrow,
  title,
  description,
  exploreHref,
  exploreLabel,
  toolbar,
  className = "",
}: OccasionCarouselProps) {
  const t = useTranslations("occasions");
  const railRef = useRef<HTMLDivElement>(null);
  const railId = useId();
  const [edges, setEdges] = useState({ canPrev: false, canNext: false });
  const hasNavigation = edges.canPrev || edges.canNext;

  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    setEdges(
      carouselEdges(rail.scrollLeft, rail.scrollWidth, rail.clientWidth),
    );
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    rail.scrollTo({ left: 0 });
    updateEdges();

    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    rail.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);

    return () => {
      observer.disconnect();
      rail.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [occasions, updateEdges]);

  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;

    const card = rail.querySelector<HTMLElement>("[data-occasion-card]");
    const step = card ? card.offsetWidth + 12 : rail.clientWidth * 0.8;
    const visible = Math.max(1, Math.floor(rail.clientWidth / step));
    const rtl = getComputedStyle(rail).direction === "rtl";
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    rail.scrollBy({
      left: direction * carouselDirection(rtl) * step * visible,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const controls = hasNavigation ? (
    <>
      <button
        type="button"
        onClick={() => scroll(-1)}
        disabled={!edges.canPrev}
        aria-label={t("carouselPrevious")}
        aria-controls={railId}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-paper text-ink transition-colors hover:border-berry/40 hover:text-berry disabled:cursor-not-allowed disabled:hover:border-line-strong disabled:hover:text-ink disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry motion-reduce:transition-none"
      >
        <ChevronLeftIcon className="h-4 w-4 rtl:-scale-x-100" />
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        disabled={!edges.canNext}
        aria-label={t("carouselNext")}
        aria-controls={railId}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-paper text-ink transition-colors hover:border-berry/40 hover:text-berry disabled:cursor-not-allowed disabled:hover:border-line-strong disabled:hover:text-ink disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry motion-reduce:transition-none"
      >
        <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
      </button>
    </>
  ) : null;

  return (
    <div className={className}>
      {title ? (
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
          href={exploreHref}
          linkLabel={exploreLabel}
          actions={
            hasNavigation ? (
              <div className="hidden items-center gap-2 sm:flex">
                {controls}
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {hasNavigation ? (
            <div className="flex shrink-0 items-center justify-end gap-2 pb-0.5">
              {controls}
            </div>
          ) : null}
        </div>
      )}

      <div className="relative">
        <div
          id={railId}
          ref={railRef}
          role="region"
          aria-label={t("carouselLabel")}
          tabIndex={0}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-0.5 py-2 [scrollbar-width:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-berry [&::-webkit-scrollbar]:hidden"
        >
          {occasions.map((occasion, index) => (
            <OccasionTile
              key={occasion.id}
              occasion={occasion}
              index={index}
            />
          ))}
        </div>
        {edges.canNext ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l from-paper to-transparent rtl:bg-gradient-to-r"
          />
        ) : null}
      </div>
    </div>
  );
}
