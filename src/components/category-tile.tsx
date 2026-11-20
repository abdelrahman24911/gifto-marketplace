import Link from "next/link";

import { CategoryGlyph } from "@/components/category-glyph";
import { ArrowRightIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import type { CatalogCategory, CatalogImagePreview } from "@/lib/catalog";

const TONES = [
  "from-berry-soft via-paper to-gold-soft/55",
  "from-gold-soft/70 via-paper to-berry-soft/55",
  "from-peach/80 via-paper to-paper-deep",
  "from-paper-deep via-paper to-berry-soft/70",
];

export function CategoryTile({
  category,
  index = 0,
  previews = [],
}: {
  category: CatalogCategory;
  index?: number;
  previews?: CatalogImagePreview[];
}) {
  const tone = TONES[index % TONES.length];
  const previewColumns =
    previews.length === 1
      ? "grid-cols-1"
      : previews.length === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <Link
      href={`/categories/${category.slug}`}
      className={`group relative flex min-h-44 flex-col overflow-hidden rounded-[1.5rem] border border-line/80 bg-gradient-to-br ${tone} p-5 shadow-[0_16px_38px_-34px_oklch(0.33_0.13_12/0.6)] transition duration-300 hover:-translate-y-1 hover:border-berry/25 hover:shadow-[0_26px_56px_-34px_oklch(0.33_0.13_12/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-9 font-display text-[7.5rem] leading-none text-ink/[0.045]"
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      <span className="relative flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-berry/15 bg-paper/75 text-berry shadow-[0_8px_18px_-14px_oklch(0.33_0.13_12/0.7)] transition-transform duration-300 group-hover:-rotate-6 motion-reduce:transition-none motion-reduce:group-hover:rotate-0">
          <CategoryGlyph slug={category.slug} />
        </span>
        <ArrowRightIcon className="mt-2 h-5 w-5 shrink-0 text-berry/80 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" />
      </span>

      {previews.length > 0 ? (
        <div
          className={`relative mt-4 grid gap-1 overflow-hidden rounded-xl border border-paper/70 bg-paper/40 p-1 ${previewColumns}`}
        >
          {previews.map((preview) => (
            <ProductImage
              key={preview.path}
              path={preview.path}
              alt={preview.alt ?? category.name}
              name={category.name}
              className="h-24 w-full"
              rounded="rounded-lg"
              sizes="(min-width: 1024px) 8vw, (min-width: 640px) 13vw, 28vw"
            />
          ))}
        </div>
      ) : null}

      <span className="relative mt-auto block pt-5">
        <span className="block font-display text-[1.35rem] leading-tight text-ink">
          {category.name}
        </span>
        {category.description ? (
          <span className="mt-1.5 block line-clamp-2 text-[0.8rem] leading-relaxed text-ink-soft">
            {category.description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
