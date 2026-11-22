import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localePrefixFor } from "@/lib/locale-path";
import type { AppLocale } from "@/i18n/routing";

import { CategoryTile } from "@/components/category-tile";
import { Container, EmptyState, Eyebrow } from "@/components/ui/section";
import { loadCategories, loadCategoryPreviews } from "@/lib/catalog";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("categories");
  return pageMetadata({
    title: t("title"),
    description: t("description"),
    path: `${localePrefixFor(locale)}/categories`,
  });
}

export default async function CategoriesPage() {
  const t = await getTranslations("categories");
  const [result, categoryPreviews] = await Promise.all([
    loadCategories(),
    loadCategoryPreviews(),
  ]);

  return (
    <div className="pb-8">
      <section className="border-b border-line bg-paper-soft/60">
        <Container className="py-12 sm:py-16">
          <Eyebrow>{t("browseEyebrow")}</Eyebrow>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-soft">
            {t("subtitle")}
          </p>
        </Container>
      </section>

      <Container className="pt-10">
        {!result.ok ? (
          <EmptyState title={t("loadErrorTitle")}>
            {t.rich("loadErrorBody", {
              browseShops: (chunks) => (
                <Link href="/shops" className="text-berry hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </EmptyState>
        ) : result.data.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.data.map((category, index) => (
              <CategoryTile
                key={category.id}
                category={category}
                index={index}
                previews={
                  categoryPreviews.ok
                    ? (categoryPreviews.data[category.id] ?? [])
                    : []
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState title={t("emptyTitle")}>
            {t.rich("emptyBody", {
              browseShops: (chunks) => (
                <Link href="/shops" className="text-berry hover:underline">
                  {chunks}
                </Link>
              ),
              searchGifts: (chunks) => (
                <Link href="/search" className="text-berry hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </EmptyState>
        )}
      </Container>
    </div>
  );
}
