import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localePrefixFor } from "@/lib/locale-path";
import type { AppLocale } from "@/i18n/routing";

import { OccasionEmpty } from "@/components/occasion-empty";
import { OccasionHero } from "@/components/occasion-hero";
import { ProductRail } from "@/components/product-rail";
import { Container, SectionHeading } from "@/components/ui/section";
import { loadNewArrivals, loadOccasions } from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";

import { OccasionBrowser } from "./occasion-browser";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("occasions");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: `${localePrefixFor(locale)}/occasions`,
  });
}

const primaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-berry px-5 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";
const secondaryLinkClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-paper/80 px-5 text-sm font-semibold text-ink transition-colors hover:border-berry/35 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";

export default async function OccasionsPage() {
  const t = await getTranslations("occasions");
  const tc = await getTranslations("common");
  const [result, recommendations] = await Promise.all([
    loadOccasions(),
    loadNewArrivals(4),
  ]);

  return (
    <div className="pb-8">
      <OccasionHero />

      <Container className="pt-8 sm:pt-10">
        {!result.ok ? (
          <OccasionEmpty
            title={t("loadErrorTitleIndex")}
            description={t("loadErrorBodyIndex")}
            action={
              <>
                <Link href="/occasions" className={primaryLinkClass}>
                  {t("tryAgain")}
                </Link>
                <Link href="/shops" className={secondaryLinkClass}>
                  {tc("browseShops")}
                </Link>
              </>
            }
          />
        ) : result.data.length > 0 ? (
          <OccasionBrowser occasions={result.data} />
        ) : (
          <OccasionEmpty
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={
              <>
                <Link href="/categories" className={primaryLinkClass}>
                  {t("browseCategories")}
                </Link>
                <Link href="/search" className={secondaryLinkClass}>
                  {t("searchGifts")}
                </Link>
              </>
            }
          />
        )}
      </Container>

      {recommendations.ok && recommendations.data.length > 0 ? (
        <Container className="pt-12 sm:pt-16">
          <section className="border-t border-line pt-8">
            <SectionHeading
              eyebrow={t("startingPoint")}
              title={t("freshIdeas")}
              description={t("freshIdeasBody")}
            />
            <ProductRail products={recommendations.data} />
          </section>
        </Container>
      ) : null}
    </div>
  );
}
