"use client";

import Image from "next/image";
import { useActionState } from "react";

import {
  deleteProductImage,
  uploadProductImages,
  type ImageActionState,
} from "./actions";

type ImageRow = { path: string; alt: string | null; position: number };

const buttonClass =
  "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60";

export function ProductImagesPanel({
  productId,
  vendorId,
  images,
}: {
  productId: string;
  vendorId: string;
  images: ImageRow[];
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState<
    ImageActionState,
    FormData
  >(uploadProductImages, null);
  const [deleteState, deleteAction, deletePending] = useActionState<
    ImageActionState,
    FormData
  >(deleteProductImage, null);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sorted = [...images].sort((a, b) => a.position - b.position);
  const uploadKey =
    uploadState && "attempt" in uploadState
      ? `upload-${uploadState.attempt}`
      : "upload-pristine";

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Photos
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Up to 8 photos, 5 MB each. The first photo is shown on cards and in
        search. JPEG, PNG, WebP or AVIF.
      </p>

      {sorted.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {sorted.map((image, index) => (
            <li
              key={image.path}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-2"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
                {baseUrl ? (
                  <Image
                    src={`${baseUrl}/storage/v1/object/public/product-images/${image.path}`}
                    alt={image.alt ?? ""}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : null}
              </div>
              <p className="truncate text-xs text-zinc-500">
                {index === 0 ? (
                  <span className="font-medium text-zinc-700">Primary</span>
                ) : (
                  (image.alt ?? `Photo ${index + 1}`)
                )}
              </p>
              <form action={deleteAction}>
                <input type="hidden" name="vendor" value={vendorId} />
                <input type="hidden" name="product_id" value={productId} />
                <input type="hidden" name="path" value={image.path} />
                <button
                  type="submit"
                  disabled={deletePending}
                  className="text-xs font-medium text-red-600 underline hover:text-red-800 disabled:opacity-60"
                >
                  {deletePending ? "Removing…" : "Remove"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          No photos yet — products with photos sell better.
        </p>
      )}

      {deleteState && "error" in deleteState ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {deleteState.error}
        </p>
      ) : null}

      <form key={uploadKey} action={uploadAction} className="mt-5 flex flex-col gap-3">
        <input type="hidden" name="vendor" value={vendorId} />
        <input type="hidden" name="product_id" value={productId} />
        <input
          type="file"
          name="images"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          required
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border file:border-zinc-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-50"
        />
        {uploadState && "error" in uploadState ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {uploadState.error}
          </p>
        ) : null}
        {uploadState && "success" in uploadState ? (
          <p
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            {uploadState.success}
          </p>
        ) : null}
        <div>
          <button type="submit" disabled={uploadPending} className={buttonClass}>
            {uploadPending ? "Uploading…" : "Upload photos"}
          </button>
        </div>
      </form>
    </section>
  );
}
