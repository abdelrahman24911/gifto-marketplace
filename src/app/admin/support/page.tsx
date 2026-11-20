import Link from "next/link";
import { redirect } from "next/navigation";

import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import {
  clampPage,
  pageWindow,
  parsePage,
  totalPages,
} from "@/lib/pagination";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  isSupportStatus,
  supportCategoryLabel,
} from "@/lib/support-requests";

import {
  AdminFilterPill,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../ui";
import { SupportStatusForm } from "./support-status-form";

import type { SupportRequestStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Support queue — Admin — Gifto" };

const STATUS_STYLES: Record<SupportRequestStatus, string> = {
  open: "border-warning/30 bg-warning-soft text-ink",
  in_progress: "border-berry/25 bg-berry-soft text-ink",
  resolved: "border-success/25 bg-success-soft text-ink",
};

const SUPPORT_PAGE_SIZE = 25;

function supportHref(
  status: string,
  page: number,
  search: string,
): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/support?${query}` : "/admin/support";
}

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  const {
    status: statusFilter,
    page: pageParam,
    q: query,
  } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  const filter =
    statusFilter && isSupportStatus(statusFilter) ? statusFilter : "all";
  const search = (query ?? "").trim().slice(0, 80);
  const searchTerm = search
    .replace(/[,()"%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const requestedPage = parsePage(pageParam);
  const page = pageWindow(requestedPage, SUPPORT_PAGE_SIZE);

  let matchingVendorIds: string[] = [];
  let vendorSearchFailed = false;
  if (searchTerm) {
    const { data: vendors, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .or(
        `name.ilike.%${searchTerm}%,slug.ilike.%${searchTerm}%`,
      )
      .limit(100);

    if (vendorError) {
      vendorSearchFailed = true;
    } else {
      matchingVendorIds = (vendors ?? []).map((vendor) => vendor.id);
    }
  }

  let listQuery = supabase
    .from("support_requests")
    .select(
      "id, category, subject, body, status, created_at, vendor:vendors(name, slug), creator:profiles(full_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filter !== "all") {
    listQuery = listQuery.eq("status", filter);
  }

  if (searchTerm) {
    const filters = [
      `subject.ilike.%${searchTerm}%`,
      `body.ilike.%${searchTerm}%`,
    ];
    if (matchingVendorIds.length > 0) {
      filters.push(`vendor_id.in.(${matchingVendorIds.join(",")})`);
    }
    for (const category of SUPPORT_CATEGORIES) {
      if (
        category.value.includes(searchTerm.toLowerCase()) ||
        category.label.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        filters.push(`category.eq.${category.value}`);
      }
    }
    listQuery = listQuery.or(filters.join(","));
  }

  const [listResult, totalResult, ...statusResults] = await Promise.all([
    listQuery.range(page.from, page.to),
    supabase
      .from("support_requests")
      .select("id", { count: "exact", head: true }),
    ...SUPPORT_STATUSES.map((status) =>
      supabase
        .from("support_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", status),
    ),
  ]);

  const requests = listResult.data ?? [];
  const totalCount = totalResult.count ?? 0;
  const filteredTotal = listResult.count ?? 0;
  const currentPage = clampPage(
    requestedPage,
    filteredTotal,
    SUPPORT_PAGE_SIZE,
  );

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(supportHref(filter, currentPage, search));
  }

  const pageCount = totalPages(filteredTotal, SUPPORT_PAGE_SIZE);
  const counts = SUPPORT_STATUSES.map((status, index) => ({
    status,
    count: statusResults[index]?.count ?? 0,
  }));
  const loadError =
    Boolean(listResult.error) ||
    Boolean(totalResult.error) ||
    vendorSearchFailed ||
    statusResults.some((result) => Boolean(result.error));
  const countOrDash = (status: SupportRequestStatus) => {
    const index = SUPPORT_STATUSES.indexOf(status);
    return statusResults[index]?.error
      ? "—"
      : (counts.find((item) => item.status === status)?.count ?? 0);
  };
  const openCount = countOrDash("open");
  const inProgressCount = countOrDash("in_progress");
  const resolvedCount = countOrDash("resolved");

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Vendor support" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Partner care"
          title="Support queue"
          description="Manual triage for requests submitted from vendor dashboards. Status changes are recorded here; no reply or notification is sent automatically."
        />
      </div>

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Open",
              value: openCount,
              hint: "Waiting for first response",
              emphasis:
                typeof openCount === "number" && openCount > 0
                  ? "warning"
                  : "default",
            },
            {
              label: "In progress",
              value: inProgressCount,
              hint: "Being investigated",
              emphasis: "accent",
            },
            {
              label: "Resolved",
              value: resolvedCount,
              hint: "Closed by administration",
              emphasis: "positive",
            },
            {
              label: "All requests",
              value: totalResult.error ? "—" : totalCount,
              hint: "Lifetime queue",
            },
          ]}
        />
      </div>

      {loadError ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="alert">
            Some support data could not be loaded. Counts or the queue may be
            incomplete; refresh the page to try again.
          </AdminNotice>
        </div>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-col gap-4 border-b border-line pb-5">
          <div className="flex flex-wrap gap-2">
            <AdminFilterPill
              href={supportHref("all", 1, search)}
              active={filter === "all"}
            >
              All
              <span className="ml-1.5 text-xs opacity-65">{totalCount}</span>
            </AdminFilterPill>
            {SUPPORT_STATUSES.map((status) => (
              <AdminFilterPill
                key={status}
                href={supportHref(status, 1, search)}
                active={filter === status}
              >
                {SUPPORT_STATUS_LABELS[status]}
                <span className="ml-1.5 text-xs opacity-65">
                  {counts.find((item) => item.status === status)?.count ?? 0}
                </span>
              </AdminFilterPill>
            ))}
          </div>

          <form
            action="/admin/support"
            method="get"
            className="flex flex-wrap items-center gap-2"
          >
            {filter !== "all" ? (
              <input type="hidden" name="status" value={filter} />
            ) : null}
            <label htmlFor="support-search" className="sr-only">
              Search support requests
            </label>
            <input
              id="support-search"
              name="q"
              type="search"
              defaultValue={search}
              maxLength={80}
              placeholder="Subject, message, shop or category"
              className="w-full min-w-0 rounded-full border border-line-strong bg-paper px-4 py-2 text-sm text-ink sm:w-80"
            />
            <button
              type="submit"
              className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep"
            >
              Search
            </button>
            {search ? (
              <Link
                href={supportHref(filter, 1, "")}
                className="text-xs font-medium text-berry hover:text-berry-deep"
              >
                Clear search
              </Link>
            ) : null}
          </form>
        </div>

        {listResult.error ? null : requests.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={
                search
                  ? "No requests match this search"
                  : filter === "all"
                    ? "The support queue is clear"
                    : "No requests match this filter"
              }
            >
              {search
                ? "Try a different subject, message, shop name or category."
                : filter === "all"
                  ? "New vendor requests will appear here."
                  : "Choose another status to see more requests."}
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs text-ink-mute">
                {filteredTotal.toLocaleString("en-US")}{" "}
                {filteredTotal === 1 ? "request" : "requests"}
                {search
                  ? ` matching "${search}"`
                  : filter === "all"
                    ? ""
                    : " match this filter"}
              </p>
              <p className="text-xs text-ink-mute">
                Newest first · page {currentPage} of {pageCount}
              </p>
            </div>
            <ul className="mt-3 flex flex-col gap-4">
              {requests.map((request) => {
                const vendor = request.vendor;
                const creator = request.creator;
                const date = new Date(request.created_at).toLocaleString(
                  "en-GB",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: BUSINESS_TIME_ZONE,
                  },
                );

                return (
                  <li
                    key={request.id}
                    className={
                      request.status === "open"
                        ? "rounded-2xl border border-warning/35 bg-warning-soft/40 p-5"
                        : "rounded-2xl border border-line bg-paper-soft p-5"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-lg font-medium text-ink">
                            {request.subject}
                          </h2>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[request.status]}`}
                          >
                            {SUPPORT_STATUS_LABELS[request.status]}
                          </span>
                        </div>
                        <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-mute">
                          <span className="font-medium text-ink-soft">
                            {supportCategoryLabel(request.category)}
                          </span>
                          <span aria-hidden>·</span>
                          {vendor ? (
                            <Link
                              href={`/admin/shops?q=${encodeURIComponent(vendor.name)}`}
                              className="font-medium text-berry hover:underline"
                            >
                              {vendor.name}
                            </Link>
                          ) : (
                            <span>Unknown shop</span>
                          )}
                          <span aria-hidden>·</span>
                          <span>{date}</span>
                          {creator?.full_name ? (
                            <>
                              <span aria-hidden>·</span>
                              <span>{creator.full_name}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <SupportStatusForm id={request.id} status={request.status} />
                    </div>
                    <p className="mt-4 whitespace-pre-line border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">
                      {request.body}
                    </p>
                  </li>
                );
              })}
            </ul>

            {pageCount > 1 ? (
              <nav
                aria-label="Support request pages"
                className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"
              >
                {currentPage > 1 ? (
                  <Link
                    href={supportHref(filter, currentPage - 1, search)}
                    className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink-mute">
                    Previous
                  </span>
                )}
                <span className="text-xs text-ink-mute">
                  Page {currentPage} of {pageCount}
                </span>
                {currentPage < pageCount ? (
                  <Link
                    href={supportHref(filter, currentPage + 1, search)}
                    className="rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink-mute">
                    Next
                  </span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
