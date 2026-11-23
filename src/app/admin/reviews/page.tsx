import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";

import {
  AdminNotice,
  AdminPageHeader,
  AdminSectionHeading,
  AdminStatStrip,
} from "../ui";
import { ModerateReviewForm } from "./moderate-review-form";

export const metadata = { title: "Reviews — Admin — Gifto" };

type ReviewQueueRow = {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  body: string | null;
  author_name: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  product: {
    name: string;
    slug: string;
    vendor: { name: string; slug: string } | null;
  } | null;
};

function reviewsHref(page = 1) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/reviews?${query}` : "/admin/reviews";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

function reviewStars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function statusLabel(status: string) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const requestedPage = parsePage(params.page);
  const range = pageWindow(requestedPage);

  const [pendingResult, moderatedResult, countsResult] = await Promise.all([
    supabase
      .from("product_reviews")
      .select(
        "id, product_id, user_id, rating, body, author_name, status, created_at, reviewed_at, product:products(name, slug, vendor:vendors(name, slug))",
        { count: "exact" },
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(range.from, range.to)
      .returns<ReviewQueueRow[]>(),
    fetchAllRows<ReviewQueueRow>((from, to) =>
      supabase
        .from("product_reviews")
        .select(
          "id, product_id, user_id, rating, body, author_name, status, created_at, reviewed_at, product:products(name, slug, vendor:vendors(name, slug))",
        )
        .neq("status", "pending")
        .order("reviewed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .returns<ReviewQueueRow[]>(),
    ),
    Promise.all([
      supabase
        .from("product_reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("product_reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      supabase
        .from("product_reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected"),
    ]),
  ]);

  const pending = (pendingResult.data ?? []) as ReviewQueueRow[];
  const pendingTotal = pendingResult.count ?? 0;
  const moderated = moderatedResult.rows.slice(0, 20);
  const [pendingCount, approvedCount, rejectedCount] = countsResult.map(
    (result) => (result.error ? null : (result.count ?? 0)),
  );
  const countsFailed = countsResult.some((result) => Boolean(result.error));
  const moderatedFailed =
    moderatedResult.failed || moderatedResult.truncated;

  const currentPage = clampPage(requestedPage, pendingTotal);
  if (!pendingResult.error && requestedPage !== currentPage) {
    redirect(reviewsHref(currentPage));
  }

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Reviews" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Trust and safety"
          title="Reviews"
          description="Customer reviews are published only after approval. Only verified buyers — customers who received the gift — can submit one, and each customer reviews a gift once."
        />
      </div>

      {pendingResult.error ? (
        <div className="mt-4">
          <AdminNotice tone="danger" role="alert">
            The review queue could not be loaded.
          </AdminNotice>
          <RefreshButton />
        </div>
      ) : null}

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Awaiting moderation",
              value: pendingCount === null ? "—" : String(pendingCount),
              hint: "New reviews to approve or reject",
              emphasis: pendingCount !== null && pendingCount > 0 ? "warning" : "default",
            },
            {
              label: "Approved",
              value: approvedCount === null ? "—" : String(approvedCount),
              hint: "Visible on gift pages",
              emphasis: "positive",
            },
            {
              label: "Rejected",
              value: rejectedCount === null ? "—" : String(rejectedCount),
              hint: "Hidden from gift pages",
            },
          ]}
        />
      </div>

      {countsFailed ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="status">
            Review counts could not be loaded. The lists below are still
            available.
          </AdminNotice>
        </div>
      ) : null}

      {!pendingResult.error ? (
        <section className="mt-8">
          <AdminSectionHeading
            title={`Awaiting moderation (${pendingTotal})`}
            description="Approve a review to publish it on the gift page, or reject it to keep it hidden. Moderation is once-only."
          />
          {pending.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No reviews awaiting moderation">
                New reviews from verified buyers will appear here.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {pending.map((review) => (
                <li
                  key={review.id}
                  className="rounded-2xl border border-line-strong bg-paper p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium text-ink">
                        <span aria-label={`${review.rating} out of 5 stars`}>
                          <span aria-hidden className="text-amber-500">
                            {reviewStars(review.rating)}
                          </span>
                        </span>{" "}
                        {review.product?.name ?? "Unknown gift"}
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        {review.product?.vendor?.name ?? "Unknown shop"} ·{" "}
                        {review.author_name ?? "Verified buyer"} ·{" "}
                        {formatDate(review.created_at)}
                      </p>
                    </div>
                    {review.product ? (
                      <Link
                        href={`/shops/${review.product.vendor?.slug ?? ""}/${review.product.slug}`}
                        className="shrink-0 text-sm font-medium text-berry hover:text-berry-deep"
                      >
                        View gift
                      </Link>
                    ) : null}
                  </div>
                  {review.body ? (
                    <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-ink-soft">
                      {review.body}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-ink-mute">
                      Rating only — no written review.
                    </p>
                  )}
                  <ModerateReviewForm
                    reviewId={review.id}
                    rating={review.rating}
                  />
                </li>
              ))}
            </ul>
          )}
          {pendingTotal > DEFAULT_PAGE_SIZE ? (
            <div className="mt-6">
              <Pagination
                page={currentPage}
                total={pendingTotal}
                pageSize={DEFAULT_PAGE_SIZE}
                buildHref={reviewsHref}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8">
        <AdminSectionHeading
          title="Recently moderated"
          description="The latest approved and rejected reviews"
        />
        {moderatedFailed ? (
          <div className="mt-4">
            <AdminNotice tone="warning" role="status">
              Recently moderated reviews could not be loaded in full.
            </AdminNotice>
          </div>
        ) : null}
        {!moderatedFailed && moderated.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Nothing moderated yet">
              Approved and rejected reviews will appear here.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {moderated.map((review) => (
              <li
                key={review.id}
                className="rounded-2xl border border-line bg-paper-soft p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-medium text-ink">
                      <span aria-label={`${review.rating} out of 5 stars`}>
                        <span aria-hidden className="text-amber-500">
                          {reviewStars(review.rating)}
                        </span>
                      </span>{" "}
                      {review.product?.name ?? "Unknown gift"}
                    </p>
                    <p className="mt-1 text-xs text-ink-mute">
                      {review.product?.vendor?.name ?? "Unknown shop"} ·{" "}
                      {review.author_name ?? "Verified buyer"} ·{" "}
                      {statusLabel(review.status)}
                      {review.reviewed_at
                        ? ` · ${formatDate(review.reviewed_at)}`
                        : ""}
                    </p>
                  </div>
                </div>
                {review.body ? (
                  <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-ink-soft">
                    {review.body}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
