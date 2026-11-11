"use client";

import { useRef, useState } from "react";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ExpandIcon,
} from "@/components/icons";
import { ProductImage } from "@/components/product-image";

export type GalleryImage = {
  path: string | null;
  alt: string | null;
};

export function ProductGallery({
  images,
  name,
}: {
  images: GalleryImage[];
  name: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const previewRef = useRef<HTMLDialogElement>(null);

  const gallery: GalleryImage[] =
    images.length > 0 ? images : [{ path: null, alt: name }];
  const active = gallery[Math.min(activeIndex, gallery.length - 1)];
  const wouldWrap = gallery.length > 1;

  function move(delta: number): void {
    setActiveIndex((index) => (index + delta + gallery.length) % gallery.length);
  }

  function openPreview(): void {
    if (!active.path) return;
    previewRef.current?.showModal();
  }

  return (
    <div className="min-w-0">
      <div className="group relative overflow-hidden rounded-3xl border border-line bg-paper-soft">
        <ProductImage
          path={active.path}
          alt={active.alt ?? name}
          name={name}
          className="aspect-[4/5] w-full"
          rounded="rounded-none"
          sizes="(min-width: 1024px) 52vw, 100vw"
          preload={activeIndex === 0}
        />

        {active.path ? (
          <button
            type="button"
            onClick={openPreview}
            className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper/90 text-ink shadow-sm backdrop-blur transition-colors hover:bg-paper hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            aria-label="View full-size image"
          >
            <ExpandIcon className="h-5 w-5" />
          </button>
        ) : null}

        {wouldWrap ? (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/90 text-ink shadow-sm backdrop-blur transition-colors hover:bg-paper hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
              aria-label="Previous image"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/90 text-ink shadow-sm backdrop-blur transition-colors hover:bg-paper hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
              aria-label="Next image"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {wouldWrap
          ? `Image ${activeIndex + 1} of ${gallery.length}`
          : "Product image"}
      </p>

      {wouldWrap ? (
        <ul
          aria-label="Product images"
          className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1"
        >
          {gallery.map((image, index) => {
            const selected = index === activeIndex;
            return (
              <li key={`${image.path ?? "fallback"}-${index}`}>
                <button
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show image ${index + 1} of ${gallery.length}`}
                  aria-pressed={selected}
                  className={`block overflow-hidden rounded-2xl border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry ${
                    selected
                      ? "border-berry"
                      : "border-transparent hover:border-berry/35"
                  }`}
                >
                  <ProductImage
                    path={image.path}
                    alt={image.alt ?? `${name} ${index + 1}`}
                    name={name}
                    className="h-20 w-20"
                    rounded="rounded-none"
                    sizes="80px"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <dialog
        ref={previewRef}
        aria-label={`${name} full-size preview`}
        onClick={(event) => {
          if (event.target === previewRef.current) previewRef.current?.close();
        }}
        className="m-auto max-h-none w-[min(94vw,72rem)] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-ink/80"
      >
        <div className="relative rounded-3xl border border-line bg-paper p-3 shadow-[0_30px_90px_-30px_oklch(0.28_0.03_40/0.55)]">
          <button
            type="button"
            onClick={() => previewRef.current?.close()}
            className="absolute right-5 top-5 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper/95 text-ink shadow-sm transition-colors hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            aria-label="Close image preview"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          <ProductImage
            path={active.path}
            alt={active.alt ?? name}
            name={name}
            fit="contain"
            rounded="rounded-2xl"
            className="h-[min(78vh,50rem)] w-full bg-paper-deep"
            sizes="(min-width: 1024px) 90vw, 100vw"
          />

          {wouldWrap ? (
            <>
              <button
                type="button"
                onClick={() => move(-1)}
                className="absolute left-5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/95 text-ink shadow-sm transition-colors hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                aria-label="Previous image"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                className="absolute right-5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-paper/95 text-ink shadow-sm transition-colors hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
                aria-label="Next image"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
