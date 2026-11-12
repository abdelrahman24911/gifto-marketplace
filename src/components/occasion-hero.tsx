import { OccasionHeroArt } from "@/components/occasion-artwork";
import { SparkleIcon } from "@/components/icons";
import { Container } from "@/components/ui/section";

export function OccasionHero() {
  return (
    <section className="relative overflow-hidden border-b border-line/60 bg-gradient-to-br from-paper via-paper-soft to-berry-soft">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-8 h-64 w-64 rounded-full bg-gold-soft/45 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-berry-soft/80 blur-3xl"
      />

      <Container className="relative grid items-center gap-2 py-8 sm:py-10 md:grid-cols-[1.05fr_0.95fr] md:gap-5 md:py-12 lg:gap-10 lg:py-14">
        <div className="gifto-rise relative z-10 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-berry/10 bg-berry-soft/80 px-4 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-berry shadow-[0_10px_30px_-24px_rgba(121,13,43,0.55)] sm:text-[0.7rem]">
            <SparkleIcon className="h-3.5 w-3.5 text-gold" />
            Find the moment
          </p>
          <h1 className="mt-5 font-display text-[clamp(3.15rem,8.5vw,5.7rem)] leading-[0.92] tracking-[-0.045em] text-ink">
            Shop by <span className="text-berry">occasion</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-soft sm:text-lg">
            From birthdays to weddings, start with the moment you&apos;re
            celebrating.
          </p>
        </div>

        <div className="gifto-rise pointer-events-none absolute -right-16 top-2 w-72 opacity-25 [animation-delay:120ms] sm:-right-10 sm:w-80 sm:opacity-30 md:relative md:right-auto md:top-auto md:col-start-2 md:row-start-1 md:w-full md:opacity-100 lg:max-w-none">
          <OccasionHeroArt className="h-auto w-full" />
        </div>
      </Container>
    </section>
  );
}
