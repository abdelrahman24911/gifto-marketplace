import Link from "next/link";

import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import {
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

const SUPPORT_LIMIT = 100;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusFilter } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  const filter =
    statusFilter && isSupportStatus(statusFilter) ? statusFilter : "all";

  const listQuery = supabase
    .from("support_requests")
    .select(
      "id, category, subject, body, status, created_at, vendor:vendors(name, slug), creator:profiles(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(SUPPORT_LIMIT);

  const [listResult, totalResult, ...statusResults] = await Promise.all([
    filter === "all" ? listQuery : listQuery.eq("status", filter),
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
  const counts = SUPPORT_STATUSES.map((status, index) => ({
    status,
    count: statusResults[index]?.count ?? 0,
  }));
  const loadError =
    Boolean(listResult.error) ||
    Boolean(totalResult.error) ||
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
        <div className="flex flex-wrap gap-2 border-b border-line pb-5">
          <AdminFilterPill href="/admin/support" active={filter === "all"}>
            All
            <span className="ml-1.5 text-xs opacity-65">{totalCount}</span>
          </AdminFilterPill>
          {SUPPORT_STATUSES.map((status) => (
            <AdminFilterPill
              key={status}
              href={`/admin/support?status=${status}`}
              active={filter === status}
            >
              {SUPPORT_STATUS_LABELS[status]}
              <span className="ml-1.5 text-xs opacity-65">
                {counts.find((item) => item.status === status)?.count ?? 0}
              </span>
            </AdminFilterPill>
          ))}
        </div>

        {listResult.error ? null : requests.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={
                filter === "all"
                  ? "The support queue is clear"
                  : "No requests match this filter"
              }
            >
              {filter === "all"
                ? "New vendor requests will appear here."
                : "Choose another status to see more requests."}
            </EmptyState>
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs text-ink-mute">
              Showing the {requests.length} most recent{" "}
              {requests.length === 1 ? "request" : "requests"}
              {requests.length === SUPPORT_LIMIT
                ? " · older requests are outside this view"
                : ""}
            </p>
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
          </>
        )}
      </section>
    </div>
  );
}
