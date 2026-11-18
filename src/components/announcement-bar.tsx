"use client";

import { Fragment, useEffect, useState } from "react";

import { PauseIcon, PlayIcon } from "@/components/icons";
import { Container } from "@/components/ui/section";

const ITEMS = [
  "Free delivery at launch",
  "Cash on delivery",
  "Every shop reviewed by Gifto",
] as const;

function StaticItems() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[0.72rem] tracking-[0.06em] sm:text-xs">
      {ITEMS.map((item, index) => (
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

function MarqueeTrack() {
  return (
    <div className="flex shrink-0 items-center gap-6 pr-6 text-[0.72rem] tracking-[0.06em] sm:text-xs">
      {ITEMS.map((item) => (
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
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

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
            <StaticItems />
          ) : (
            <>
              <div className="relative min-w-0 flex-1 overflow-hidden">
                <div
                  aria-hidden
                  className={`flex w-max animate-[gifto-marquee_32s_linear_infinite] motion-reduce:animate-none ${
                    paused ? "[animation-play-state:paused]" : ""
                  }`}
                >
                  <MarqueeTrack />
                  <MarqueeTrack />
                </div>
                <span className="sr-only">
                  Free delivery at launch. Cash on delivery. Every shop reviewed
                  by Gifto.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-label={
                  paused ? "Play announcements" : "Pause announcements"
                }
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
          <StaticItems />
        </div>
      </Container>
    </div>
  );
}
