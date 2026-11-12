import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import type { CatalogOccasion } from "@/lib/catalog";
import { OCCASION_IMAGES_BUCKET } from "@/lib/supabase/database.types";

export function OccasionTile({ occasion }: { occasion: CatalogOccasion }) {
  return (
    <Link
      href={`/occasions/${occasion.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-paper-soft transition duration-300 hover:-translate-y-1 hover:border-berry/30 hover:shadow-[0_22px_50px_-30px_oklch(0.33_0.13_12/0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
    >
      <div className="relative overflow-hidden">
        <ProductImage
          path={occasion.imagePath}
          alt={occasion.imageAlt ?? occasion.name}
          name={occasion.name}
          bucket={OCCASION_IMAGES_BUCKET}
          className="aspect-[16/10] w-full transition duration-500 group-hover:scale-[1.03]"
          rounded="rounded-none"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      </div>

      <div className="flex flex-1 items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="font-display text-2xl leading-tight text-ink">
            {occasion.name}
          </p>
          {occasion.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
              {occasion.description}
            </p>
          ) : null}
        </div>
        <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-berry transition-transform duration-300 group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
