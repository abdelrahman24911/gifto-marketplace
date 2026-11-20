import { getLocale, getTranslations } from "next-intl/server";

import {
  BanknoteIcon,
  GiftIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/icons";
import { Container, SectionHeading } from "@/components/ui/section";

export async function HowItWorks() {
  const t = await getTranslations("home");
  const locale = await getLocale();
  const stepNumber = (n: number) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en", {
      minimumIntegerDigits: 2,
    }).format(n);
  const steps = [
    {
      icon: SearchIcon,
      title: t("stepsFindTitle"),
      body: t("stepsFindBody"),
    },
    {
      icon: GiftIcon,
      title: t("stepsWrapTitle"),
      body: t("stepsWrapBody"),
    },
    {
      icon: BanknoteIcon,
      title: t("stepsPayTitle"),
      body: t("stepsPayBody"),
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-24 py-16 sm:py-20">
      <Container>
        <SectionHeading
          eyebrow={t("howItWorksTitle")}
          title={t("howItWorksHeading")}
          description={t("howItWorksDescription")}
        />

        <div className="rounded-[2rem] border border-line bg-gradient-to-br from-paper via-paper-soft to-berry-soft/45 p-6 sm:p-9">
          <ol className="grid gap-8 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="relative sm:px-7 sm:first:pl-0 sm:last:pr-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <span
                    aria-hidden
                    className="font-display text-4xl leading-none text-berry/20"
                  >
                    {stepNumber(index + 1)}
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
            {t("reviewedNote")}
          </p>
        </div>
      </Container>
    </section>
  );
}
