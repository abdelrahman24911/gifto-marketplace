"use client";

import Image from "next/image";
import { useState } from "react";

import { shouldOptimizeImages } from "@/lib/images";
import {
  PRODUCT_IMAGES_BUCKET,
  VENDOR_MEDIA_BUCKET,
} from "@/lib/supabase/database.types";

/**
 * Renders a shop logo when one has been uploaded, falling back to the berry
 * monogram (or the initial when the file cannot load).
 *
 * New logos are stored in `vendor-media`. The `product-images` fallback keeps
 * pre-migration logos working until the one-off media backfill has run.
 */
export function ShopLogo({
  name,
  path,
  className = "h-12 w-12 rounded-xl text-xl",
}: {
  name: string;
  path: string | null;
  className?: string;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [previousPath, setPreviousPath] = useState(path);

  if (previousPath !== path) {
    setPreviousPath(path);
    setSourceIndex(0);
    setFailed(false);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const buckets = [VENDOR_MEDIA_BUCKET, PRODUCT_IMAGES_BUCKET];
  const src =
    path && baseUrl && !failed
      ? `${baseUrl}/storage/v1/object/public/${buckets[sourceIndex] ?? VENDOR_MEDIA_BUCKET}/${path}`
      : null;

  if (!src || failed) {
    const initial = name.trim().charAt(0).toUpperCase() || "?";
    return (
      <div
        aria-hidden
        className={`flex shrink-0 items-center justify-center bg-berry font-display font-medium text-paper ${className}`}
      >
        {initial}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={`${name} logo`}
      width={96}
      height={96}
      unoptimized={!shouldOptimizeImages()}
      onError={() => {
        if (sourceIndex < buckets.length - 1) {
          setSourceIndex((index) => index + 1);
        } else {
          setFailed(true);
        }
      }}
      className={`shrink-0 bg-paper-deep object-cover ${className}`}
    />
  );
}
