import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import type { CatalogCategory } from "@/lib/catalog";

const TONES = [
  "from-berry-soft to-paper-deep",
  "from-gold-soft to-paper-deep",
  "from-paper-deep to-berry-soft",
];

export function CategoryTile({
  category,
  index = 0,
}: {
  category: CatalogCategory;
  index?: number;
}) {
  const tone = TONES[index % TONES.length];

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group relative flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl border border-line p-5 transition duration-300 hover:-translate-y-1 hover:border-berry/30 hover:shadow-[0_22px_50px_-30px_oklch(0.33_0.13_12/0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
    >
      <span
        aria-hidden
        className={`absolute inset-0 bg-gradient-to-br ${tone} opacity-70 transition-opacity duration-300 group-hover:opacity-90`}
      />
      <span className="relative flex items-start justify-between gap-3">
        <span className="font-display text-2xl leading-tight text-ink">
          {category.name}
        </span>
        <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-berry transition-transform duration-300 group-hover:translate-x-1" />
      </span>
      {category.description ? (
        <span className="relative line-clamp-2 text-sm text-ink-soft">
          {category.description}
        </span>
      ) : null}
    </Link>
  );
}
