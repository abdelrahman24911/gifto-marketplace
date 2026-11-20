"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";

import { submitReview, type SubmitReviewState } from "./review-actions";

/**
 * Read-only star row (UX Batch 2). Stars are text glyphs with an
 * accessible label, not emoji; filled stars are amber, the rest muted.
 */
export function ReviewStars({
  rating,
  size = "md",
}: {
  rating: number;
  size?: "sm" | "md" | "lg";
}) {
  const t = useTranslations("product");
  const sizeClass =
    size === "sm" ? "text-xs" : size === "lg" ? "text-2xl" : "text-base";
  return (
    <span
      role="img"
      aria-label={t("reviewStars", { count: rating })}
      className={`inline-flex items-center gap-0.5 ${sizeClass}`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <span
          key={value}
          aria-hidden
          className={value <= rating ? "text-amber-500" : "text-zinc-300"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function ReviewForm({
  productId,
  shopSlug,
  productSlug,
}: {
  productId: string;
  shopSlug: string;
  productSlug: string;
}) {
  const [state, formAction, pending] = useActionState<
    SubmitReviewState,
    FormData
  >(submitReview, null);
  const [rating, setRating] = useState(0);
  const t = useTranslations("product");
  const id = useId();
  const succeeded = Boolean(state && "success" in state);

  return (
    <form action={formAction} className="mt-4 grid gap-4">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="shop_slug" value={shopSlug} />
      <input type="hidden" name="product_slug" value={productSlug} />

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-zinc-900"
        >
          {state.error}
        </p>
      ) : null}
      {succeeded && state && "success" in state ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-zinc-900"
        >
          {state.success}
        </p>
      ) : null}

      <fieldset disabled={pending || succeeded}>
        <legend className="text-sm font-medium text-zinc-700">
          {t("reviewRatingLabel")}
        </legend>
        <div
          role="radiogroup"
          aria-label={t("reviewRatingLabel")}
          className="mt-1 flex items-center gap-1"
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="cursor-pointer rounded-md p-1 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-zinc-900"
            >
              <input
                type="radio"
                name="rating"
                value={value}
                required
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
                aria-label={t("reviewStars", { count: value })}
              />
              <span
                aria-hidden
                className={`text-2xl leading-none ${
                  value <= rating ? "text-amber-500" : "text-zinc-300"
                }`}
              >
                ★
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor={`${id}-body`}
          className="block text-sm font-medium text-zinc-700"
        >
          {t("reviewBodyLabel")}
        </label>
        <textarea
          id={`${id}-body`}
          name="body"
          rows={3}
          maxLength={1000}
          disabled={pending || succeeded}
          placeholder={t("reviewBodyPlaceholder")}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100"
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={pending || succeeded || rating === 0}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? t("reviewSubmitting") : t("reviewSubmit")}
        </button>
      </div>
    </form>
  );
}
