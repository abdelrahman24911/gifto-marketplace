"use client";

import { useTranslations } from "next-intl";

import { OccasionFallbackArt } from "@/components/occasion-artwork";
import { ProductImage } from "@/components/product-image";
import { Link } from "@/i18n/navigation";
import type { CatalogOccasion } from "@/lib/catalog";
import {
  isSeedPlaceholderImage,
  occasionDisplayName,
} from "@/lib/occasion-display";
import { OCCASION_IMAGES_BUCKET } from "@/lib/supabase/database.types";

const TONES = [
  "from-gold-soft/70 via-paper-soft to-paper",
  "from-peach/80 via-paper-soft to-paper",
  "from-berry-soft/70 via-paper-soft to-paper",
  "from-paper-deep/75 via-paper-soft to-paper",
];

/**
 * Compact occasion card used inside `OccasionCarousel`: a square image with
 * the occasion name underneath. Descriptions live on the destination page.
 */
export function OccasionTile({
  occasion,
  index = 0,
}: {
  occasion: CatalogOccasion;
  index?: number;
}) {
  const t = useTranslations("occasions");
  const name = occasionDisplayName(occasion.slug, occasion.name, t);
  const fallbackArt = (
    <OccasionFallbackArt
      initial={name.trim().charAt(0).toUpperCase() || "?"}
      tone={index}
    />
  );

  return (
    <Link
      href={`/occasions/${occasion.slug}`}
      data-occasion-card
      className={`group flex w-28 flex-none snap-start flex-col gap-1.5 rounded-2xl border border-line/70 bg-gradient-to-br p-1.5 shadow-[0_14px_30px_-26px_rgba(121,13,43,0.5)] transition duration-300 hover:-translate-y-0.5 hover:border-berry/25 hover:shadow-[0_20px_38px_-26px_rgba(121,13,43,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-36 sm:p-2 lg:w-40 ${TONES[index % TONES.length]}`}
    >
      <span className="relative block aspect-square w-full overflow-hidden rounded-[0.9rem] bg-paper/70">
        {isSeedPlaceholderImage(occasion.imagePath) ? (
          fallbackArt
        ) : (
          <ProductImage
            path={occasion.imagePath}
            alt={occasion.imageAlt ?? name}
            name={name}
            bucket={OCCASION_IMAGES_BUCKET}
            className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            rounded="rounded-none"
            sizes="(min-width: 1024px) 160px, (min-width: 640px) 144px, 112px"
            fallback={fallbackArt}
          />
        )}
      </span>
      <span className="line-clamp-2 min-h-[2.4em] px-0.5 pb-0.5 text-center text-xs font-semibold leading-[1.2] text-ink sm:text-[0.8125rem]">
        {name}
      </span>
    </Link>
  );
}
