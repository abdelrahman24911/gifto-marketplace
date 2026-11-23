"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import {
  isMailConfigured,
  processMailOutbox,
  requeueMailOutbox,
} from "@/lib/mail";
import { checkMutationQuota } from "@/lib/rate-limit";

export type MailOutboxActionState = {
  error?: string;
  success?: string;
} | null;

/**
 * Retries pending mail-outbox rows (migration 63). Admin-only, quota
 * guarded like the other admin mutations. Retries are admin-triggered:
 * there is no cron infrastructure in this repo yet, so nothing retries
 * on its own. The retry never re-enqueues a failed send — a row that
 * fails again stays pending (or terminal 'failed' after 5 attempts).
 *
 * S-06: the retry is refused while no SMTP provider is configured.
 * processMailOutbox already refuses such a run without touching any
 * row, but the check here gives the admin a clear error instead of a
 * misleading "0 sent" success, and the defensive `skipped` branch
 * covers a provider removed between the check and the run.
 */
export async function retryMailOutbox(
  _prev: MailOutboxActionState,
): Promise<MailOutboxActionState> {
  void _prev;
  const { user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };

  if (!isMailConfigured()) {
    return {
      error:
        "SMTP is not configured yet. Configure an SMTP provider first — " +
        "retrying now would not send anything.",
    };
  }

  const result = await processMailOutbox({ limit: 25 });
  if (result.skipped === "unconfigured") {
    return {
      error:
        "SMTP is not configured yet. Configure an SMTP provider first — " +
        "retrying now would not send anything.",
    };
  }
  if (result.skipped === "demo-environment") {
    return {
      error:
        "This is a demo environment — email sending is disabled here so " +
        "no real customer ever gets a demo email. These rows stay pending " +
        "for a deployment where sending is allowed.",
    };
  }
  revalidatePath("/admin/mail-outbox");
  return {
    success:
      `Retried the mail queue: ${result.sent} sent, ` +
      `${result.failed} failed, ${result.remaining} still pending.`,
  };
}

/**
 * Requeues one terminally failed outbox row (S-06) so it can be retried
 * once SMTP is configured. Requeueing itself burns no attempt — it only
 * moves the row back to pending with a fresh attempt count — so it is
 * allowed even before a provider exists; the retry action above stays
 * guarded. Admin-only, quota guarded like the other admin mutations.
 *
 * S-10: requeues are capped at MAIL_OUTBOX_MAX_REQUEUES (2) per row —
 * a row at the cap stays terminally failed, and the admin is told so
 * instead of seeing a generic failure.
 */
export async function requeueMailOutboxRow(
  _prev: MailOutboxActionState,
  formData: FormData,
): Promise<MailOutboxActionState> {
  const { user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };

  const rowId = String(formData.get("row_id") ?? "").trim();
  if (!rowId) return { error: "Choose a failed email to requeue." };

  const result = await requeueMailOutbox(rowId);
  if (!result.ok) {
    return {
      error:
        result.reason === "cap_reached"
          ? "That email has already been requeued twice and stays failed. " +
            "It cannot be requeued again — check the failure reason and " +
            "resend it another way if it still matters."
          : "That email could not be requeued — it may no longer be failed.",
    };
  }
  revalidatePath("/admin/mail-outbox");
  return {
    success:
      "Email requeued. Retry the queue once SMTP is configured to send it.",
  };
}
