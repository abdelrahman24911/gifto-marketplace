import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { MAIL_OUTBOX_MAX_REQUEUES, isMailConfigured } from "@/lib/mail";

import { AdminNotice, AdminPageHeader } from "../ui";
import { MailOutboxRequeueForm } from "./mail-outbox-requeue-form";
import { MailOutboxRetryForm } from "./mail-outbox-retry-form";

export const metadata = { title: "Mail outbox — Admin — Gifto" };

const STATUS_STYLES: Record<string, string> = {
  pending: "border-warning/30 bg-warning-soft text-ink",
  sent: "border-success/25 bg-success-soft text-ink",
  failed: "border-danger/30 bg-danger-soft text-ink",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Mail outbox (migration 63): notification emails that were skipped
 * (no SMTP provider configured) or failed to send, queued for retry.
 * Recovery, password-reset and staff-invite emails are never queued —
 * their single-use links must not be persisted. Retries run
 * automatically once daily via /api/cron/mail-outbox (scheduled in
 * vercel.json) and can also be triggered here by an admin.
 */
export default async function AdminMailOutboxPage() {
  const { supabase } = await requirePlatformAdmin();
  // S-06: retries are refused while no provider is configured, so say
  // so up front instead of letting the admin discover it per click.
  const mailConfigured = isMailConfigured();

  const [pendingResult, failedResult] = await Promise.all([
    supabase
      .from("mail_outbox")
      .select(
        "id, kind, to_email, subject, body_text, status, attempts, last_error, first_error, requeue_count, created_at, sent_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("mail_outbox")
      .select(
        "id, kind, to_email, subject, body_text, status, attempts, last_error, first_error, requeue_count, created_at, sent_at",
      )
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const pending = pendingResult.data ?? [];
  const failed = failedResult.data ?? [];
  const error = pendingResult.error ?? failedResult.error;

  return (
    <div className="w-full">
      <Breadcrumb
        items={[{ href: "/admin", label: "Admin" }, { label: "Mail outbox" }]}
      />
      <AdminPageHeader
        title="Mail outbox"
        description="Notification emails that were skipped or failed to send. Retry them once SMTP is configured — recovery, password-reset and staff-invite emails are never queued."
      />

      {error ? (
        <div className="mt-4">
          <AdminNotice tone="danger" role="alert">
            The mail queue could not be loaded.
          </AdminNotice>
          <RefreshButton />
        </div>
      ) : null}

      {!mailConfigured ? (
        <AdminNotice tone="warning" role="alert">
          SMTP is not configured yet, so retries are disabled — retrying
          now would not send anything. Failed emails can still be
          requeued below (up to {MAIL_OUTBOX_MAX_REQUEUES} times each);
          retry the queue once a provider is configured.
        </AdminNotice>
      ) : null}

      {error ? null : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="text-sm text-ink-mute">
              {pending.length} pending · {failed.length} failed (showing
              latest)
            </p>
            <MailOutboxRetryForm disabled={!mailConfigured} />
          </div>

          {pending.length === 0 && failed.length === 0 ? (
            <EmptyState title="Mail queue is empty">
              No skipped or failed notification emails are waiting. When a
              send is skipped or fails, it appears here for retry.
            </EmptyState>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {[...pending, ...failed].map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-line bg-paper px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ink">{row.subject}</p>
                  <span
                    className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[row.status] ?? ""}`}
                  >
                    {row.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-mute">
                  To {row.to_email} · {row.kind} · queued{" "}
                  {formatDateTime(row.created_at)}
                  {row.sent_at ? ` · sent ${formatDateTime(row.sent_at)}` : ""}
                  {row.attempts > 0 ? ` · ${row.attempts} attempt(s)` : ""}
                  {row.requeue_count > 0
                    ? ` · requeued ${row.requeue_count} ${row.requeue_count === 1 ? "time" : "times"}`
                    : ""}
                </p>
                {row.last_error ? (
                  <p className="mt-2 rounded-lg bg-paper-deep px-3 py-2 text-xs text-ink-soft">
                    Latest failure: {row.last_error}
                  </p>
                ) : null}
                {row.first_error &&
                row.first_error !== row.last_error ? (
                  <p className="mt-2 rounded-lg bg-paper-deep px-3 py-2 text-xs text-ink-soft">
                    First failure: {row.first_error}
                  </p>
                ) : null}
                {row.status === "failed" ? (
                  <MailOutboxRequeueForm
                    rowId={row.id}
                    requeueCount={row.requeue_count ?? 0}
                    maxRequeues={MAIL_OUTBOX_MAX_REQUEUES}
                  />
                ) : null}
              </li>
          ))}
        </ol>
      )}
        </>
      )}
    </div>
  );
}
