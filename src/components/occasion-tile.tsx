import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { OccasionFallbackArt } from "@/components/occasion-artwork";
import { ProductImage } from "@/components/product-image";
import type { CatalogOccasion } from "@/lib/catalog";
import { occasionDisplayName } from "@/lib/occasion-display";
import { OCCASION_IMAGES_BUCKET } from "@/lib/supabase/database.types";

const TONES = [
  "from-berry-soft/80 via-paper-soft to-paper",
  "from-peach/90 via-paper-soft to-paper",
  "from-gold-soft/55 via-paper-soft to-berry-soft/50",
];

const FALLBACK_DESCRIPTIONS: Record<string, string> = {
  graduation: "Mark the milestone with a gift they'll keep.",
  "ramdan-night": "Thoughtful gifts for warm Ramadan evenings.",
  "ramadan-night": "Thoughtful gifts for warm Ramadan evenings.",
};

export function OccasionTile({
  occasion,
  index = 0,
}: {
  occasion: CatalogOccasion;
  index?: number;
}) {
  const name = occasionDisplayName(occasion.slug, occasion.name);
  const description =
    occasion.description?.trim() || FALLBACK_DESCRIPTIONS[occasion.slug] || null;

  return (
    <Link
      href={`/occasions/${occasion.slug}`}
      className={`group grid h-full min-h-[13rem] grid-cols-[42%_58%] overflow-hidden rounded-[1.75rem] border border-line/70 bg-gradient-to-br ${TONES[index % TONES.length]} shadow-[0_18px_45px_-36px_rgba(121,13,43,0.55)] transition duration-300 hover:-translate-y-1 hover:border-berry/25 hover:shadow-[0_28px_60px_-38px_rgba(121,13,43,0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-h-[13.5rem] sm:grid-cols-[40%_60%] lg:min-h-[14rem]`}
    >
      <div className="relative min-h-full overflow-hidden">
        <ProductImage
          path={occasion.imagePath}
          alt={occasion.imageAlt ?? name}
          name={name}
          bucket={OCCASION_IMAGES_BUCKET}
          className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          rounded="rounded-none"
          sizes="(min-width: 1024px) 12vw, (min-width: 640px) 20vw, 38vw"
          fallback={
            <OccasionFallbackArt
              initial={name.trim().charAt(0).toUpperCase() || "?"}
              tone={index}
            />
          }
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-berry-deep/10 via-transparent to-paper/15"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-paper/25"
        />
      </div>

      <div className="relative flex min-w-0 flex-col p-4 sm:p-5">
        <div className="min-w-0">
          <p className="line-clamp-2 min-h-[2.1em] break-words font-display text-[1.4rem] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[1.5rem]">
            {name}
          </p>
          {description ? (
            <p className="mt-2 line-clamp-2 text-[0.78rem] leading-[1.625] text-ink-soft sm:text-sm">
              {description}
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex justify-end pt-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-berry text-paper shadow-[0_12px_24px_-16px_rgba(121,13,43,0.8)] transition-colors duration-300 group-hover:bg-berry-deep sm:h-11 sm:w-11">
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </span>
        </div>
      </div>
    </Link>
  );
}
