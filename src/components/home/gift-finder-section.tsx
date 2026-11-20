import { getTranslations } from "next-intl/server";

import { GiftFinder } from "@/components/gift-finder";
import { Container, SectionError, SectionHeading } from "@/components/ui/section";
import type { GiftFinderPage } from "@/lib/gift-finder";

export async function GiftFinderSection({
  page,
  occasions,
}: {
  /** `null` means the catalogue read failed; render an honest error. */
  page: GiftFinderPage | null;
  occasions: { name: string; slug: string }[];
}) {
  const t = await getTranslations("home");
  const tg = await getTranslations("giftFinder");
  const tc = await getTranslations("common");

  return (
    <section
      id="gift-finder"
      className="scroll-mt-24 border-t border-line bg-paper-soft/55 py-16 sm:py-20"
    >
      <Container>
        <SectionHeading
          eyebrow={t("giftFinderEyebrow")}
          title={tg("title")}
          description={t("giftFinderDescription")}
        />
        {page ? (
          <GiftFinder initialPage={page} occasions={occasions} />
        ) : (
          <SectionError title={tc("sectionLoadError")}>
            {tc("refreshToRetry")}
          </SectionError>
        )}
      </Container>
    </section>
  );
}
