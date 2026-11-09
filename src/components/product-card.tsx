import Link from "next/link";

import { ProductImage } from "@/components/product-image";
import { formatEgp } from "@/lib/money";

type ProductCardProps = {
  href: string;
  name: string;
  priceMinor: number;
  stock: number;
  imagePath: string | null;
  imageAlt: string | null;
  vendorName?: string | null;
  categoryName?: string | null;
};

export function ProductCard({
  href,
  name,
  priceMinor,
  stock,
  imagePath,
  imageAlt,
  vendorName,
  categoryName,
}: ProductCardProps) {
  const soldOut = stock <= 0;

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-paper-soft transition duration-300 hover:-translate-y-1 hover:border-berry/30 hover:shadow-[0_22px_50px_-30px_oklch(0.33_0.13_12/0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
    >
      <div className="relative overflow-hidden">
        <ProductImage
          path={imagePath}
          alt={imageAlt ?? name}
          name={name}
          className="aspect-[4/5] w-full"
          rounded="rounded-none"
          sizes="(min-width: 1024px) 25vw, 50vw"
        />
        {soldOut ? (
          <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-ink-soft">
            Sold out
          </span>
        ) : null}
      </div>

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
          <p className="font-display text-lg text-ink">{formatEgp(priceMinor)}</p>
        </div>
      </div>
    </Link>
  );
}
