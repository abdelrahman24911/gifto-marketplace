import type { ReactNode } from "react";

import { GiftIcon, SparkleIcon } from "@/components/icons";

export function OccasionEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-gradient-to-br from-paper-soft via-paper to-berry-soft/60 px-6 py-12 text-center sm:px-10 sm:py-14">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-berry-soft/70 blur-2xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-12 h-44 w-44 rounded-full bg-gold-soft/50 blur-2xl"
      />

      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-berry/10 bg-paper/85 text-berry shadow-[0_18px_35px_-25px_rgba(121,13,43,0.6)]">
        <GiftIcon className="h-7 w-7" />
        <SparkleIcon className="absolute -right-2 -top-2 h-5 w-5 text-gold" />
      </div>
      <p className="relative mt-5 font-display text-2xl leading-tight text-ink sm:text-3xl">
        {title}
      </p>
      <div className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
        {description}
      </div>
      {action ? (
        <div className="relative mt-6 flex flex-wrap justify-center gap-3">
          {action}
        </div>
      ) : null}
    </div>
  );
}
