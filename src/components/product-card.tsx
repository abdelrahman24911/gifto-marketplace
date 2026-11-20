"use client";

import { useLocale, useTranslations } from "next-intl";

import { ProductImage } from "@/components/product-image";
import { QuickAddButton } from "@/components/quick-add-button";
import { Link } from "@/i18n/navigation";
import { formatEgp, type MoneyLocale } from "@/lib/money";
import type { QuickAddItem } from "@/lib/quick-add";

type ProductCardProps = {
  href: string;
  name: string;
  priceMinor: number;
  stock: number;
  imagePath: string | null;
  imageAlt: string | null;
  vendorName?: string | null;
  categoryName?: string | null;
  /** Opt-in quick add. The homepage uses it; other surfaces keep their current card link. */
  quickAdd?: {
    item: QuickAddItem;
    acceptingOrders: boolean;
  };
};

const CARD_CLASS =
  "group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-paper-soft transition duration-300 hover:-translate-y-1 hover:border-berry/30 hover:shadow-[0_22px_50px_-30px_oklch(0.33_0.13_12/0.55)] motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const FOCUS_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry";

function CardMedia({
  name,
  imagePath,
  imageAlt,
  soldOut,
}: {
  name: string;
  imagePath: string | null;
  imageAlt: string | null;
  soldOut: boolean;
}) {
  const t = useTranslations("product");

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-berry-soft via-paper-deep to-gold-soft">
      {!imagePath ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-display text-6xl text-berry-deep/20"
        >
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      ) : null}
      <ProductImage
        path={imagePath}
        alt={imageAlt ?? name}
        name={name}
        className="relative z-10 aspect-[4/5] w-full"
        rounded="rounded-none"
        sizes="(min-width: 1024px) 25vw, 50vw"
      />
      {soldOut ? (
        <span className="absolute left-3 top-3 z-20 rounded-full bg-paper/95 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-ink-soft">
          {t("soldOut")}
        </span>
      ) : null}
    </div>
  );
}

function CardBody({
  name,
  priceMinor,
  vendorName,
  categoryName,
}: {
  name: string;
  priceMinor: number;
  vendorName?: string | null;
  categoryName?: string | null;
}) {
  const locale = useLocale() as MoneyLocale;

  return (
    <div className="flex flex-1 flex-col gap-1 p-4">
      {categoryName ? (
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-berry">
          {categoryName}
        </p>
      ) : null}
      <p className="font-medium leading-snug text-ink group-hover:underline">
        {name}
      </p>
      {vendorName ? (
        <p className="truncate text-sm text-ink-mute">{vendorName}</p>
      ) : null}

      <div className="mt-auto pt-3">
        <p className="font-display text-lg text-ink">
          {formatEgp(priceMinor, locale)}
        </p>
      </div>
    </div>
  );
}

export function ProductCard({
  href,
  name,
  priceMinor,
  stock,
  imagePath,
  imageAlt,
  vendorName,
  categoryName,
  quickAdd,
}: ProductCardProps) {
  const soldOut = stock <= 0;

  if (quickAdd) {
    return (
      <article className={`${CARD_CLASS} focus-within:border-berry/30`}>
        <Link href={href} className={`flex flex-1 flex-col ${FOCUS_CLASS}`}>
          <CardMedia
            name={name}
            imagePath={imagePath}
            imageAlt={imageAlt}
            soldOut={soldOut}
          />
          <CardBody
            name={name}
            priceMinor={priceMinor}
            vendorName={vendorName}
            categoryName={categoryName}
          />
        </Link>
        <div className="px-4 pb-4">
          <QuickAddButton
            item={quickAdd.item}
            acceptingOrders={quickAdd.acceptingOrders}
          />
        </div>
      </article>
    );
  }

  return (
    <Link href={href} className={`${CARD_CLASS} ${FOCUS_CLASS}`}>
      <CardMedia
        name={name}
        imagePath={imagePath}
        imageAlt={imageAlt}
        soldOut={soldOut}
      />
      <CardBody
        name={name}
        priceMinor={priceMinor}
        vendorName={vendorName}
        categoryName={categoryName}
      />
    </Link>
  );
}
