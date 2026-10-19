"use client";

import Image from "next/image";
import { useState } from "react";

import { PRODUCT_IMAGES_BUCKET } from "@/lib/supabase/database.types";

/**
 * Renders a catalog image from its Storage path, falling back to a warm
 * typographic panel when there is no image yet or the file cannot load, so a
 * missing photo looks intentional rather than broken.
 */
export function ProductImage({
  path,
  alt,
  name,
  className = "h-40 w-full",
  rounded = "rounded-xl",
}: {
  path: string | null;
  alt: string;
  name: string;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const src =
    path && baseUrl
      ? `${baseUrl}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${path}`
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
      unoptimized
      onError={() => setFailed(true)}
      className={`object-cover ${rounded} ${className}`}
    />
  );
}
