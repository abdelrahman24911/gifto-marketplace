import Link from "next/link";

import { requirePlatformAdmin } from "@/lib/auth";
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  isSupportStatus,
  supportCategoryLabel,
} from "@/lib/support-requests";

import { SupportStatusForm } from "./support-status-form";

import type { SupportRequestStatus } from "@/lib/supabase/database.types";

export const metadata = { title: "Support queue - Admin - Gifto" };

const STATUS_STYLES: Record<SupportRequestStatus, string> = {
  open: "border-amber-200 bg-amber-50 text-amber-800",
  in_progress: "border-sky-200 bg-sky-50 text-sky-800",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

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
    .limit(100);

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

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <Link
        href="/admin"
        className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        ← Back to administration
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
        Vendor support queue
      </h1>
      <p className="mt-1 text-sm text-zinc-600">
        Manual triage for requests submitted from vendor dashboards. No replies
        or notifications are sent from here.
      </p>

      {loadError ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Some support data could not be loaded. Counts or the queue may be
          incomplete; refresh the page to try again.
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-3 gap-3">
        {counts.map(({ status, count }) => (
          <div
            key={status}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {SUPPORT_STATUS_LABELS[status]}
            </dt>
            <dd className="text-2xl font-semibold text-zinc-900">{count}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Filter support requests" className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/support"
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
            filter === "all"
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          All ({totalCount})
        </Link>
        {SUPPORT_STATUSES.map((status) => (
          <Link
            key={status}
            href={`/admin/support?status=${status}`}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
              filter === status
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
            }`}
          >
            {SUPPORT_STATUS_LABELS[status]} (
            {counts.find((item) => item.status === status)?.count ?? 0})
          </Link>
        ))}
      </nav>

      {requests.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          No support requests match this filter.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {requests.map((request) => {
            const vendor = request.vendor;
            const creator = request.creator;
            return (
              <li
                key={request.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-zinc-900">
                        {request.subject}
                      </h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide ${STATUS_STYLES[request.status]}`}
                      >
                        {SUPPORT_STATUS_LABELS[request.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {supportCategoryLabel(request.category)} ·{" "}
                      {vendor ? (
                        <Link
                          href={`/shops/${vendor.slug}`}
                          className="underline hover:text-zinc-900"
                        >
                          {vendor.name}
                        </Link>
                      ) : (
                        "Unknown shop"
                      )}{" "}
                      · {new Date(request.created_at).toLocaleString()}
                      {creator?.full_name ? ` · ${creator.full_name}` : ""}
                    </p>
                  </div>
                  <SupportStatusForm id={request.id} status={request.status} />
                </div>
                <p className="mt-4 whitespace-pre-line text-sm text-zinc-700">
                  {request.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
