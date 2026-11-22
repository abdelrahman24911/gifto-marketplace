import { getTranslations } from "next-intl/server";

import { ArrowRightIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { ShopLogo } from "@/components/shop-logo";
import { Link } from "@/i18n/navigation";
import type { CatalogImagePreview } from "@/lib/catalog";

type Shop = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  governorate: string | null;
  logoPath: string | null;
};

export async function ShopCard({
  shop,
  previews = [],
}: {
  shop: Shop;
  previews?: CatalogImagePreview[];
}) {
  const t = await getTranslations("product");
  const location = [shop.city, shop.governorate].filter(Boolean).join(", ");
  const previewColumns =
    previews.length === 1
      ? "grid-cols-1"
      : previews.length === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <Link
      href={`/shops/${shop.slug}`}
      className="group flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-line bg-paper-soft p-5 transition duration-300 hover:-translate-y-1 hover:border-berry/30 hover:shadow-[0_22px_50px_-30px_oklch(0.33_0.13_12/0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
    >
      <div className="flex min-w-0 items-center gap-3">
        <ShopLogo name={shop.name} path={shop.logoPath} />
        <div className="min-w-0">
          <p className="truncate font-display text-lg text-ink">
            {shop.name}
          </p>
          {location ? (
            <p className="truncate text-sm text-ink-mute">{location}</p>
          ) : null}
        </div>
      </div>

      {previews.length > 0 ? (
        <div
          className={`grid gap-1 overflow-hidden rounded-xl border border-line/70 bg-paper/60 p-1 ${previewColumns}`}
        >
          {previews.map((preview) => (
            <ProductImage
              key={preview.path}
              path={preview.path}
              alt={preview.alt ?? shop.name}
              name={shop.name}
              className="h-20 w-full"
              rounded="rounded-lg"
              sizes="(min-width: 1024px) 10vw, (min-width: 640px) 15vw, 30vw"
            />
          ))}
        </div>
      ) : null}

      {shop.description ? (
        <p className="line-clamp-3 text-sm text-ink-soft">{shop.description}</p>
      ) : null}

      <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-berry">
        {t("visitShop")}
        <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none rtl:-scale-x-100" />
      </span>
    </Link>
  );
}
