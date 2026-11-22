import type { ReactNode } from "react";

const GLYPHS: Record<string, ReactNode> = {
  "gift-boxes": (
    <>
      <path d="M5 12h22v15H5zM4 7h24v5H4zM16 7v20" />
      <path d="M16 7c-2.2-4.5-8-4.5-8-1.2 0 2.1 2.8 3.1 8 1.2Zm0 0c2.2-4.5 8-4.5 8-1.2 0 2.1-2.8 3.1-8 1.2Z" />
    </>
  ),
  flowers: (
    <>
      <path d="M16 27V14M16 20c-4.2 0-7-2.6-7-6M16 18c3.6 0 6-2.2 6-5" />
      <path d="M16 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" />
      <path d="M12 8c-2.4-2.6-5.2-1.5-5.2.8 0 1.5 2 2.6 5.2 2.2M20 8c2.4-2.6 5.2-1.5 5.2.8 0 1.5-2 2.6-5.2 2.2" />
    </>
  ),
  "chocolates-sweets": (
    <>
      <rect x="4" y="6" width="24" height="20" rx="2.5" />
      <path d="M12 6v20M20 6v20M4 13h24M4 19h24" />
      <path d="M8 9.5h1M16 9.5h1M24 9.5h1M8 16h1M16 16h1M24 16h1" />
    </>
  ),
  "cakes-baked-goods": (
    <>
      <path d="M5 27h22M7 27v-9.5c0-1.4 1.1-2.5 2.5-2.5h13c1.4 0 2.5 1.1 2.5 2.5V27" />
      <path d="M7 20c2 1.7 4 1.7 6 0s4-1.7 6 0 4 1.7 6 0M16 15V8M16 8c-1.5 0-2.4-1.2-1.3-2.4L16 4l1.3 1.6C18.4 6.8 17.5 8 16 8Z" />
    </>
  ),
  "personalized-gifts": (
    <>
      <path d="M8 6h16v20l-4-2.5L16 26l-4-2.5L8 26V6Z" />
      <path d="M16 17c-2.2-2.3-5-4.2-5-6.3C11 8.6 12.4 8 14 8c.9 0 1.6.5 2 1.2.4-.7 1.1-1.2 2-1.2 1.6 0 3 .6 3 2.7 0 2.1-2.8 4-5 6.3Z" />
    </>
  ),
  "toys-kids": (
    <>
      <circle cx="16" cy="10" r="5" />
      <circle cx="10.5" cy="6.5" r="2.5" />
      <circle cx="21.5" cy="6.5" r="2.5" />
      <path d="M9 27c0-7 2.8-11 7-11s7 4 7 11M8 22c-2 0-3-1.3-3-3M24 22c2 0 3-1.3 3-3M14 10h.01M18 10h.01M14 12.5c1.2 1 2.8 1 4 0" />
    </>
  ),
  occasions: (
    <>
      <path d="M6 11h20v17H6zM10 7v7M22 7v7M6 17h20" />
      <path d="M16 21c.7 2.6 2 3.9 4.5 4.5-2.5.6-3.8 1.9-4.5 4.5-.7-2.6-2-3.9-4.5-4.5 2.5-.6 3.8-1.9 4.5-4.5Z" />
    </>
  ),
  "corporate-gifts": (
    <>
      <rect x="4" y="11" width="24" height="16" rx="2" />
      <path d="M11 11V8c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v3M4 18h24M16 18v3" />
    </>
  ),
};

const FALLBACK = GLYPHS["gift-boxes"];

export function CategoryGlyph({
  slug,
  className = "h-6 w-6",
}: {
  slug: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {GLYPHS[slug] ?? FALLBACK}
    </svg>
  );
}
