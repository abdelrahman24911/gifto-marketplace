import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";
import { requireVendorRole } from "@/lib/vendor";

import {
  VendorEmpty,
  VendorFilterPill,
  VendorNotice,
  VendorPageHeader,
  VendorSectionHeading,
  VendorStatStrip,
} from "../ui";

export const metadata = { title: "Reviews — Gifto" };

type ReviewStatus = "pending" | "approved" | "rejected";

type VendorReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  author_name: string | null;
  status: ReviewStatus;
  created_at: string;
  reviewed_at: string | null;
  product:
    | {
        name: string;
        slug: string;
      }
    | {
        name: string;
        slug: string;
      }[]
    | null;
};

const FILTERS: ReadonlyArray<{ value: "all" | ReviewStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Published" },
  { value: "rejected", label: "Rejected" },
];

function reviewsHref(vendorId: string, status: "all" | ReviewStatus, page = 1) {
  const params = new URLSearchParams({ vendor: vendorId });
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  return `/vendor/reviews?${params.toString()}`;
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

export default async function VendorReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; status?: string; page?: string }>;
}) {
  const { vendor, status: statusParam, page: pageParam } =
    await searchParams;
  const { supabase, access } = await requireVendorRole(vendor);
  const vendorId = access.vendorId;
  const status =
    statusParam === "pending" ||
    statusParam === "approved" ||
    statusParam === "rejected"
      ? statusParam
      : "all";
  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  let listQuery = supabase
    .from("product_reviews")
    .select(
      "id, rating, body, author_name, status, created_at, reviewed_at, product:products(name, slug)",
      { count: "exact" },
    );
  if (status !== "all") listQuery = listQuery.eq("status", status);

  const [listResult, pendingResult, approvedResult, rejectedResult] =
    await Promise.all([
      listQuery
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(range.from, range.to)
        .returns<VendorReviewRow[]>(),
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
    ]);

  const total = listResult.count ?? 0;
  const currentPage = clampPage(requestedPage, total);
  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(reviewsHref(vendorId, status, currentPage));
  }

  const reviews = listResult.data ?? [];

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Customer feedback"
        title="Reviews"
        description="See what verified buyers have said about your gifts. Pending reviews are visible here but remain unpublished until Gifto approves them."
      />

      {listResult.error ? (
        <div className="mt-4">
          {listResult.error.code === "PGRST205" ? (
            <VendorNotice tone="info" role="status">
              Shop reviews are waiting for migration 54 to be applied to the
              hosted database. Review data will appear here after deployment.
            </VendorNotice>
          ) : (
            <>
              <VendorNotice tone="danger" role="alert">
                Reviews could not be loaded.
              </VendorNotice>
              <RefreshButton />
            </>
          )}
        </div>
      ) : null}

      <div className="mt-6">
        <VendorStatStrip
          items={[
            {
              label: "Pending",
              value: String(pendingResult.count ?? 0),
              hint: "Awaiting Gifto moderation",
              emphasis: (pendingResult.count ?? 0) > 0 ? "warning" : "default",
            },
            {
              label: "Published",
              value: String(approvedResult.count ?? 0),
              hint: "Visible on gift pages",
              emphasis: "positive",
            },
            {
              label: "Rejected",
              value: String(rejectedResult.count ?? 0),
              hint: "Hidden from gift pages",
            },
          ]}
        />
      </div>

      <section className="mt-8">
        <VendorSectionHeading
          title="Gift reviews"
          description="Choose a status to narrow the feedback for this shop."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <VendorFilterPill
              key={filter.value}
              href={reviewsHref(vendorId, filter.value)}
              active={status === filter.value}
            >
              {filter.label}
            </VendorFilterPill>
          ))}
        </div>

        {!listResult.error && reviews.length === 0 ? (
          <div className="mt-6">
            <VendorEmpty
              title={
                status === "all"
                  ? "No reviews for this shop yet"
                  : `No ${status} reviews`
              }
            >
              Verified-buyer reviews on your gifts will appear here after
              customers submit them.
            </VendorEmpty>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {reviews.map((review) => {
              const product = Array.isArray(review.product)
                ? review.product[0]
                : review.product;
              const statusLabel =
                review.status === "approved"
                  ? "Published"
                  : review.status === "rejected"
                    ? "Rejected"
                    : "Pending";

              return (
                <li
                  key={review.id}
                  className="rounded-2xl border border-line bg-paper-soft p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-medium text-ink">
                        <span
                          aria-label={`${review.rating} out of 5 stars`}
                          className="mr-2 text-amber-500"
                        >
                          {reviewStars(review.rating)}
                        </span>
                        {product?.name ?? "Unknown gift"}
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        {review.author_name ?? "Verified buyer"} ·{" "}
                        {formatDate(review.created_at)} · {statusLabel}
                      </p>
                    </div>
                    {product ? (
                      <Link
                        href={`/vendor/products?vendor=${vendorId}`}
                        className="text-sm font-medium text-berry hover:text-berry-deep"
                      >
                        Manage product
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
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6">
          <Pagination
            page={currentPage}
            total={total}
            pageSize={DEFAULT_PAGE_SIZE}
            buildHref={(page) => reviewsHref(vendorId, status, page)}
            label="Vendor review pages"
          />
        </div>
      </section>
    </div>
  );
}
