import { GiftFinder } from "@/components/gift-finder";
import { Container, SectionError, SectionHeading } from "@/components/ui/section";
import type { GiftFinderPage } from "@/lib/gift-finder";

export function GiftFinderSection({
  page,
  occasions,
}: {
  /** `null` means the catalogue read failed; render an honest error. */
  page: GiftFinderPage | null;
  occasions: { name: string; slug: string }[];
}) {
  return (
    <section
      id="gift-finder"
      className="scroll-mt-24 border-t border-line bg-paper-soft/55 py-16 sm:py-20"
    >
      <Container>
        <SectionHeading
          eyebrow="A little help"
          title="Gift Finder"
          description="Answer three quick questions and see real gifts that fit the moment, the person, and your budget."
        />
        {page ? (
          <GiftFinder initialPage={page} occasions={occasions} />
        ) : (
          <SectionError title="We couldn't load Gift Finder">
            Refresh the page to try again.
          </SectionError>
        )}
      </Container>
    </section>
  );
}
