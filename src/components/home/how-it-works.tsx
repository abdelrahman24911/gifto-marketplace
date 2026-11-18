import {
  BanknoteIcon,
  GiftIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/icons";
import { Container, SectionHeading } from "@/components/ui/section";

const STEPS = [
  {
    icon: SearchIcon,
    title: "Find something that fits",
    body: "Browse by occasion, category, or budget — or let Gift Finder narrow the catalogue for you.",
  },
  {
    icon: GiftIcon,
    title: "The shop wraps it",
    body: "Your order goes to the independent shop that prepares, wraps, and packs the gift.",
  },
  {
    icon: BanknoteIcon,
    title: "Pay cash on arrival",
    body: "Pay the courier in cash when it arrives. Prices and stock are confirmed before checkout.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow="How Gifto works"
          title="From browse to doorstep, simply."
          description="No account needed to explore. Every shop is reviewed before it appears on Gifto."
        />

        <div className="rounded-[2rem] border border-line bg-gradient-to-br from-paper via-paper-soft to-berry-soft/45 p-6 sm:p-9">
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="relative sm:px-7 sm:first:pl-0 sm:last:pr-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <span
                    aria-hidden
                    className="font-display text-4xl leading-none text-berry/20"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-berry/15 bg-paper text-berry shadow-[0_10px_22px_-18px_oklch(0.33_0.13_12/0.6)]">
                    <step.icon className="h-5 w-5" />
                  </span>
                </div>
                <h3 className="mt-5 font-display text-xl leading-tight text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>

          <p className="mt-8 flex items-center gap-2 border-t border-line pt-5 text-xs text-ink-mute">
            <ShieldIcon className="h-4 w-4 text-berry/80" />
            Every shop is reviewed by Gifto before it goes live.
          </p>
        </div>
      </Container>
    </section>
  );
}
