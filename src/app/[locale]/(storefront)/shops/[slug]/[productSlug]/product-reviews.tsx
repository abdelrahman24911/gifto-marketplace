import { getLocale, getTranslations } from "next-intl/server";

import { Eyebrow } from "@/components/ui/section";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/i18n/routing";

import { ReviewForm, ReviewStars } from "./review-form";

type ReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  author_name: string | null;
  created_at: string;
};

type OwnReviewRow = ReviewRow & { status: string };

function formatReviewDate(value: string, locale: AppLocale): string {
  return new Date(value).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * UX Batch 2 (reviews): the public review list for one gift, plus the
 * submission form for verified buyers. Approved reviews are public;
 * anything pending is visible only to its author (via RLS) and to the
 * admin queue. The average comes from product_review_summary so it is
 * never computed from a partial page of rows.
 */
export async function ProductReviews({
  productId,
  shopSlug,
  productSlug,
}: {
  productId: string;
  shopSlug: string;
  productSlug: string;
}) {
  const supabase = await createClient();
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("product");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [summaryResult, reviewsResult, viewerResult] = await Promise.all([
    supabase.rpc("product_review_summary", { p_product_id: productId }),
    supabase
      .from("product_reviews")
      .select("id, rating, body, author_name, created_at")
      .eq("product_id", productId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(0, 19)
      .returns<ReviewRow[]>(),
    user
      ? Promise.all([
          supabase.rpc("is_verified_buyer", { p_product_id: productId }),
          supabase
            .from("product_reviews")
            .select("id, rating, body, author_name, created_at, status")
            .eq("product_id", productId)
            .eq("user_id", user.id)
            .maybeSingle<OwnReviewRow>(),
        ])
      : Promise.resolve([null, { data: null }] as const),
  ]);

  const summary = summaryResult.data?.[0] ?? null;
  const reviewCount = summary?.review_count ?? 0;
  const averageRating = summary?.average_rating ?? null;
  const reviews = reviewsResult.data ?? [];
  const verified = viewerResult[0]?.data === true;
  const ownReview = viewerResult[1]?.data ?? null;

  return (
    <section
      aria-labelledby="reviews-heading"
      className="mt-10 border-t border-line pt-10 lg:mt-14"
    >
      <Eyebrow>{t("reviewsTitle")}</Eyebrow>
      <h2
        id="reviews-heading"
        className="mt-2 font-display text-2xl text-ink sm:text-3xl"
      >
        {t("reviewsTitle")}
      </h2>

      {reviewCount > 0 && averageRating !== null ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <ReviewStars rating={Math.round(averageRating)} size="lg" />
          <span className="font-medium text-ink">
            {t("reviewsAverage", { average: averageRating.toFixed(1) })}
          </span>
          <span aria-hidden>·</span>
          <span>{t("reviewCount", { count: reviewCount })}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-mute">{t("reviewsEmpty")}</p>
      )}

      {reviews.length > 0 ? (
        <ul className="mt-6 grid gap-4">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="rounded-2xl border border-line bg-paper-soft p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ReviewStars rating={review.rating} />
                <span className="text-sm font-medium text-ink">
                  {review.author_name
                    ? t("reviewBy", { name: review.author_name })
                    : t("reviewAnonymous")}
                </span>
                <span className="inline-flex items-center rounded-full border border-line bg-paper px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-mute">
                  {t("verifiedBuyer")}
                </span>
                <span className="text-xs text-ink-mute">
                  {formatReviewDate(review.created_at, locale)}
                </span>
              </div>
              {review.body ? (
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink-soft">
                  {review.body}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 rounded-3xl border border-line bg-paper-soft p-5 sm:p-6">
        <h3 className="font-display text-xl text-ink">
          {t("reviewFormTitle")}
        </h3>
        {!user ? (
          <p className="mt-2 text-sm text-ink-soft">
            <Link
              href="/login"
              className="font-medium text-berry underline underline-offset-2 hover:text-berry-deep"
            >
              {t("reviewSignIn")}
            </Link>
          </p>
        ) : ownReview ? (
          <p role="status" className="mt-2 text-sm text-ink-soft">
            {ownReview.status === "pending"
              ? t("reviewPending")
              : t("reviewAlreadySubmitted")}
          </p>
        ) : verified ? (
          <ReviewForm
            productId={productId}
            shopSlug={shopSlug}
            productSlug={productSlug}
          />
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {t("reviewNotEligible")}
          </p>
        )}
      </div>
    </section>
  );
}
