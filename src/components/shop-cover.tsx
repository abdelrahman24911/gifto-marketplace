"use client";

import Image from "next/image";
import { useState } from "react";

import { shouldOptimizeImages } from "@/lib/images";
import { VENDOR_MEDIA_BUCKET } from "@/lib/supabase/database.types";

/** Public shop banner, with a designed fallback when no cover is uploaded. */
export function ShopCover({
  path,
  name,
  className = "h-40 w-full sm:h-56",
  preload = false,
}: {
  path: string | null;
  name: string;
  className?: string;
  /** Preload when the banner is above the fold (the shop page). */
  preload?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [previousPath, setPreviousPath] = useState(path);

  if (previousPath !== path) {
    setPreviousPath(path);
    setFailed(false);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const src =
    path && baseUrl
      ? `${baseUrl}/storage/v1/object/public/${VENDOR_MEDIA_BUCKET}/${path}`
      : null;

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-berry-soft via-paper-deep to-gold-soft ${className}`}
      >
        <span className="absolute -right-10 -top-16 h-48 w-48 rounded-full border border-berry-tint/70" />
        <span className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full border border-gold/40" />
        <span className="absolute right-8 top-8 font-display text-3xl font-medium text-berry-deep/60">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={`${name} cover`}
      width={1600}
      height={600}
      sizes="(min-width: 1024px) 960px, 100vw"
      preload={preload}
      unoptimized={!shouldOptimizeImages()}
      onError={() => setFailed(true)}
      className={`rounded-2xl object-cover ${className}`}
    />
  );
}
