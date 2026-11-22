"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { PauseIcon, PlayIcon } from "@/components/icons";
import { Container } from "@/components/ui/section";

function StaticItems({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[0.72rem] tracking-[0.06em] sm:text-xs">
      {items.map((item, index) => (
        <Fragment key={item}>
          {index > 0 ? (
            <span aria-hidden className="text-gold">
              ·
            </span>
          ) : null}
          <span>{item}</span>
        </Fragment>
      ))}
    </div>
  );
}

function MarqueeTrack({ items }: { items: string[] }) {
  return (
    <div className="flex shrink-0 items-center gap-6 pr-6 text-[0.72rem] tracking-[0.06em] sm:text-xs">
      {items.map((item) => (
        <Fragment key={item}>
          <span className="whitespace-nowrap">{item}</span>
          <span aria-hidden className="text-gold">
            ·
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export function AnnouncementBar() {
  const t = useTranslations("announcement");
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const items = [t("freeDelivery"), t("cashOnDelivery"), t("reviewedShops")];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <div className="bg-berry-deep text-paper">
      <Container className="flex min-h-9 items-center gap-2 py-1.5">
        <div
          className={`min-w-0 flex-1 ${
            reducedMotion ? "flex" : "hidden sm:flex"
          }`}
        >
          {reducedMotion ? (
            <StaticItems items={items} />
          ) : (
            <>
              <div className="relative min-w-0 flex-1 overflow-hidden">
                <div
                  aria-hidden
                  className={`flex w-max animate-[gifto-marquee_32s_linear_infinite] motion-reduce:animate-none ${
                    paused ? "[animation-play-state:paused]" : ""
                  }`}
                >
                  <MarqueeTrack items={items} />
                  <MarqueeTrack items={items} />
                </div>
                <span className="sr-only">{t("full")}</span>
              </div>
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-label={paused ? t("play") : t("pause")}
                className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-paper/20 text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {paused ? (
                  <PlayIcon className="h-3.5 w-3.5" />
                ) : (
                  <PauseIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          )}
        </div>
        <div className={reducedMotion ? "hidden" : "flex sm:hidden"}>
          <StaticItems items={items} />
        </div>
      </Container>
    </div>
  );
}
