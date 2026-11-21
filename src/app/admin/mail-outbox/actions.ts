"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { processMailOutbox } from "@/lib/mail";
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
 */
export async function retryMailOutbox(
  _prev: MailOutboxActionState,
): Promise<MailOutboxActionState> {
  void _prev;
  const { user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError };

  const result = await processMailOutbox({ limit: 25 });
  revalidatePath("/admin/mail-outbox");
  return {
    success:
      `Retried the mail queue: ${result.sent} sent, ` +
      `${result.failed} failed, ${result.remaining} still pending.`,
  };
}
