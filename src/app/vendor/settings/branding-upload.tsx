"use client";

import { useActionState } from "react";

import { ProductImage } from "@/components/product-image";
import {
  PRODUCT_IMAGES_BUCKET,
  VENDOR_MEDIA_BUCKET,
} from "@/lib/supabase/database.types";

import {
  removeVendorCover,
  removeVendorLogo,
  uploadVendorCover,
  uploadVendorLogo,
  type LogoActionState,
} from "./actions";

const buttonClass =
  "rounded-md bg-berry px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-berry-deep disabled:cursor-not-allowed disabled:opacity-60";

const BRANDING = {
  logo: {
    title: "Shop logo",
    description:
      "Shown on your public shop page and shop cards. A square image works best. JPEG, PNG, WebP or AVIF, up to 5 MB.",
    field: "logo",
    uploadLabel: "Upload logo",
    removeLabel: "Remove logo",
    previewClass: "h-24 w-24",
    rounded: "rounded-2xl",
    fallbackBucket: PRODUCT_IMAGES_BUCKET,
  },
  cover: {
    title: "Cover image",
    description:
      "The wide banner at the top of your public shop page. JPEG, PNG, WebP or AVIF, up to 5 MB.",
    field: "cover",
    uploadLabel: "Upload cover",
    removeLabel: "Remove cover",
    previewClass: "h-32 w-full",
    rounded: "rounded-xl",
    fallbackBucket: undefined,
  },
} as const;

export function BrandingUpload({
  kind,
  vendorId,
  name,
  path,
  canEdit,
}: {
  kind: keyof typeof BRANDING;
  vendorId: string;
  name: string;
  path: string | null;
  canEdit: boolean;
}) {
  const spec = BRANDING[kind];
  const uploadAction = kind === "logo" ? uploadVendorLogo : uploadVendorCover;
  const removeAction = kind === "logo" ? removeVendorLogo : removeVendorCover;

  const [uploadState, submitUpload, uploadPending] = useActionState<
    LogoActionState,
    FormData
  >(uploadAction, null);
  const [removeState, submitRemove, removePending] = useActionState<
    LogoActionState,
    FormData
  >(removeAction, null);

  const uploadKey =
    uploadState && "attempt" in uploadState
      ? `upload-${uploadState.attempt}`
      : "upload-pristine";

  return (
    <section
      aria-labelledby={`${kind}-heading`}
      className="rounded-2xl border border-line bg-paper-soft p-5"
    >
      <h2 id={`${kind}-heading`} className="font-display text-lg text-ink">
        {spec.title}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{spec.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <ProductImage
          path={path}
          alt={`${name} ${kind}`}
          name={name}
          className={spec.previewClass}
          rounded={spec.rounded}
          bucket={VENDOR_MEDIA_BUCKET}
          fallbackBucket={spec.fallbackBucket}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {path ? `Current ${kind}` : `No ${kind} yet`}
          </p>
          <p className="mt-1 text-xs text-ink-mute">
            {path
              ? `Uploading a new image replaces this one.`
              : kind === "logo"
                ? "Until you upload one, Gifto shows your shop's initial."
                : "Until you upload one, Gifto shows a branded banner."}
          </p>
        </div>
      </div>

      {canEdit ? (
        <>
          {uploadState && "error" in uploadState ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {uploadState.error}
            </p>
          ) : null}
          {uploadState && "success" in uploadState ? (
            <p
              role="status"
              className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              {uploadState.success}
            </p>
          ) : null}
          {removeState && "error" in removeState ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {removeState.error}
            </p>
          ) : null}
          {removeState && "success" in removeState ? (
            <p
              role="status"
              className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              {removeState.success}
            </p>
          ) : null}

          <form
            key={uploadKey}
            action={submitUpload}
            className="mt-4 flex flex-col gap-3"
          >
            <input type="hidden" name="vendor" value={vendorId} />
            <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
              {spec.uploadLabel}
              <input
                type="file"
                name={spec.field}
                accept="image/jpeg,image/png,image/webp,image/avif"
                required
                className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-paper file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-paper-deep"
              />
            </label>
            <div>
              <button
                type="submit"
                disabled={uploadPending}
                className={buttonClass}
              >
                {uploadPending ? "Uploading…" : spec.uploadLabel}
              </button>
            </div>
          </form>

          {path ? (
            <form
              action={submitRemove}
              className="mt-3 border-t border-line pt-3"
            >
              <input type="hidden" name="vendor" value={vendorId} />
              <button
                type="submit"
                disabled={removePending}
                className="text-sm font-medium text-red-600 underline hover:text-red-800 disabled:opacity-60"
              >
                {removePending ? "Removing…" : spec.removeLabel}
              </button>
            </form>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-xs text-ink-mute">
          Only the shop owner can change the {kind}.
        </p>
      )}
    </section>
  );
}
