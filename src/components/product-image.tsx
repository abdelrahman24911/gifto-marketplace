"use client";

import Image from "next/image";
import { useState } from "react";

import { shouldOptimizeImages } from "@/lib/images";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/supabase/database.types";

/**
 * Renders a catalog image from its Storage path, falling back to a warm
 * typographic panel when there is no image yet or the file cannot load, so a
 * missing photo looks intentional rather than broken.
 *
 * `bucket`/`fallbackBucket` support the vendor-branding rollout: new uploads
 * live in `vendor-media`, while legacy logos remain readable from
 * `product-images` until the backfill has run.
 */
export function ProductImage({
  path,
  alt,
  name,
  className = "h-40 w-full",
  rounded = "rounded-xl",
  bucket = PRODUCT_IMAGES_BUCKET,
  fallbackBucket,
  sizes,
  preload = false,
}: {
  path: string | null;
  alt: string;
  name: string;
  className?: string;
  rounded?: string;
  bucket?: string;
  fallbackBucket?: string;
  /** Rendered width hint for the browser, e.g. "(min-width: 1024px) 25vw, 50vw". */
  sizes?: string;
  /** Preload an above-the-fold (LCP) image. */
  preload?: boolean;
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
  const buckets = fallbackBucket ? [bucket, fallbackBucket] : [bucket];
  const src =
    path && baseUrl && !failed
      ? `${baseUrl}/storage/v1/object/public/${buckets[sourceIndex] ?? bucket}/${path}`
      : null;

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-berry-soft via-paper-deep to-gold-soft ${rounded} ${className}`}
      >
        <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full border border-berry-tint/70" />
        <span className="absolute -bottom-8 -left-6 h-24 w-24 rounded-full border border-gold/40" />
        <span className="relative font-display text-4xl font-medium text-berry-deep/75">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={400}
      height={500}
      sizes={sizes}
      preload={preload}
      unoptimized={!shouldOptimizeImages()}
      onError={() => {
        if (sourceIndex < buckets.length - 1) {
          setSourceIndex((index) => index + 1);
        } else {
          setFailed(true);
        }
      }}
      className={`object-cover ${rounded} ${className}`}
    />
  );
}
