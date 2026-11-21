import "server-only";

import nodemailer from "nodemailer";

import { formatEgp } from "./money";
import { ORDER_STATUS_LABELS } from "./orders";
import { getSiteUrl } from "./site-url";
import { createServiceClient } from "./supabase/service";

import type { Transporter } from "nodemailer";
import type { OrderStatus } from "./supabase/database.types";

/**
 * Gifto transactional email (P1-01, CR-02, H-21).
 *
 * SMTP first: one server-only module, configured entirely from environment
 * names — no provider credential is ever committed. Until the owner chooses
 * an SMTP provider and supplies its account (see docs/HOSTED_STATE.md,
 * "SMTP / notifications" row), `getMailConfig()` returns null and every send
 * is skipped with an ops-visible log entry instead of failing the request
 * that triggered it.
 *
 * A failed send must never roll back an order, a status change, or a refund
 * resolution: every public helper in this module catches its own errors,
 * logs them with the `[gifto-mail]` prefix for ops retry, and returns a
 * result instead of throwing. Callers `await` the helpers but never branch
 * on them. Skipped/failed notification sends are also written to the
 * mail_outbox table (migration 63) so an admin can retry them from
 * /admin/mail-outbox; recovery, password-reset and staff-invite emails
 * are never enqueued — their single-use links must not be persisted, and
 * a retry after expiry would be useless.
 *
 * Templates are plain-text first; the HTML body is the same content in a
 * minimal wrapper. Amounts use the existing EGP formatter (integer
 * piasters). No guest token, reset link, or credential is ever logged.
 */

export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
  timeoutMs: number;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailSendResult =
  | { sent: true; messageId: string }
  | { sent: false; skipped?: "unconfigured"; error?: string };

/** Kinds of notification that may be queued in mail_outbox. */
export type MailOutboxKind =
  | "order_placed_customer"
  | "order_placed_vendor"
  | "order_status"
  | "refund_opened"
  | "refund_resolved"
  | "support_status"
  | "staff_added"
  | "notification";

/** A retry stops permanently after this many failed attempts. */
export const MAIL_OUTBOX_MAX_ATTEMPTS = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 65535
    ? parsed
    : fallback;
}

function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const lowered = value.trim().toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return null;
}

/**
 * Reads the SMTP configuration from environment names only. Returns null
 * when no provider is configured (no host or no sender address), which is
 * the expected state until the owner supplies an SMTP account.
 *
 * Names (see .env.example): SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
 * SMTP_PASS, MAIL_FROM, SMTP_TIMEOUT_MS.
 */
export function getMailConfig(
  env: NodeJS.ProcessEnv = process.env,
): MailConfig | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.MAIL_FROM?.trim();
  if (!host || !from) return null;

  const port = parsePort(env.SMTP_PORT, 587);
  const secure = parseBoolean(env.SMTP_SECURE) ?? port === 465;

  return {
    host,
    port,
    secure,
    user: env.SMTP_USER?.trim() || null,
    pass: env.SMTP_PASS?.trim() || null,
    from,
    timeoutMs: parsePort(env.SMTP_TIMEOUT_MS, 5000),
  };
}

export function isMailConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getMailConfig(env) !== null;
}

function createMailTransport(config: MailConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth:
      config.user && config.pass
        ? { user: config.user, pass: config.pass }
        : undefined,
    connectionTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });
}

function htmlWrap(title: string, text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="font-family:sans-serif;color:#18181b"><h1 style="font-size:18px">${title}</h1><p>${escaped}</p><p style="color:#71717a;font-size:13px">Gifto — gifts from local shops, cash on delivery.</p></body></html>`;
}

function logSkipped(to: string, subject: string, reason: string): void {
  console.error(
    `[gifto-mail] NOT SENT to=${to} subject="${subject}": ${reason}. ` +
      "Configure SMTP_HOST and MAIL_FROM (see .env.example) and retry from the ops log.",
  );
}

function logFailed(to: string, subject: string, error: unknown): void {
  console.error(
    `[gifto-mail] FAILED to=${to} subject="${subject}": ${error instanceof Error ? error.message : "unknown error"}. ` +
      "The order/status/refund that triggered this email was NOT rolled back; retry the send from the ops log.",
  );
}

/**
 * Sends one message. Never throws: an unconfigured provider, an invalid
 * recipient, or a transport failure is returned as `{ sent: false }` and
 * logged for ops retry. A skipped/failed notification send is also
 * written to mail_outbox (unless `enqueue: false`, which the
 * single-use-link sends use) so an admin can retry it later.
 */
export async function sendMail(
  message: MailMessage,
  overrides: {
    config?: MailConfig | null;
    transport?: Transporter;
    kind?: MailOutboxKind;
    enqueue?: boolean;
  } = {},
): Promise<MailSendResult> {
  const config =
    overrides.config !== undefined
      ? overrides.config
      : getMailConfig();

  if (!EMAIL_PATTERN.test(message.to)) {
    return { sent: false, error: "invalid recipient email" };
  }

  if (!config && !overrides.transport) {
    logSkipped(message.to, message.subject, "SMTP is not configured");
    if (overrides.enqueue !== false) {
      await enqueueMailOutbox(
        message,
        overrides.kind ?? "notification",
        "SMTP is not configured",
      );
    }
    return { sent: false, skipped: "unconfigured" };
  }

  const transport =
    overrides.transport ??
    createMailTransport(config as MailConfig);

  try {
    const info = await transport.sendMail({
      from: config?.from ?? "Gifto <no-reply@gifto.test>",
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true, messageId: info.messageId ?? "" };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "send failed";
    logFailed(message.to, message.subject, error);
    if (overrides.enqueue !== false) {
      await enqueueMailOutbox(message, overrides.kind ?? "notification", reason);
    }
    return { sent: false, error: reason };
  }
}

/**
 * Writes one undelivered notification to mail_outbox for later retry.
 * Best-effort and never throws: the outbox must never break the request
 * that triggered the send, and in unit tests there is no service client.
 */
export async function enqueueMailOutbox(
  message: MailMessage,
  kind: MailOutboxKind,
  reason: string,
): Promise<boolean> {
  try {
    const service = createServiceClient();
    const { error } = await service.from("mail_outbox").insert({
      kind,
      to_email: message.to,
      subject: message.subject,
      body_text: message.text,
      body_html: message.html ?? null,
      status: "pending",
      last_error: reason.slice(0, 500),
    });
    if (error) {
      console.error(
        `[gifto-mail] outbox enqueue failed to=${message.to} subject="${message.subject}": ${error.message}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      `[gifto-mail] outbox enqueue failed to=${message.to} subject="${message.subject}": ${error instanceof Error ? error.message : "unknown error"}`,
    );
    return false;
  }
}

export type MailOutboxRow = {
  id: string;
  kind: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  attempts: number;
};

/**
 * Requeues one terminally failed outbox row (migration 63, S-06) so it
 * can be retried again once SMTP is configured. Only a row already in
 * 'failed' moves: a pending or sent row is left untouched and the call
 * returns false. Attempts reset to 0 — the requeue starts a fresh retry
 * cycle; the 5-attempt cap still applies to the new cycle. Never throws.
 */
export async function requeueMailOutbox(rowId: string): Promise<boolean> {
  if (!rowId) return false;
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("mail_outbox")
      .select("id, status")
      .eq("id", rowId)
      .maybeSingle();
    const row = data as unknown as { id: string; status: string } | null;
    if (error || !row || row.status !== "failed") return false;
    const { error: updateError } = await service
      .from("mail_outbox")
      .update({
        status: "pending",
        attempts: 0,
        last_error: "Requeued by an admin — retry once SMTP is configured.",
      })
      .eq("id", rowId);
    return !updateError;
  } catch {
    return false;
  }
}

/**
 * Retries pending outbox rows, oldest first (admin-triggered from
 * /admin/mail-outbox; a future cron route can call the same function).
 * Each row is sent with `enqueue: false` so a failed retry never
 * re-enqueues itself. After MAIL_OUTBOX_MAX_ATTEMPTS the row is marked
 * 'failed' (terminal) instead of spinning forever. Never throws.
 *
 * S-06: a retry run with no SMTP provider configured does nothing at
 * all — it returns `{ skipped: "unconfigured" }` without touching any
 * row. Treating a skipped send like a transport failure used to burn
 * one attempt per retry click, terminal-failing rows after five clicks
 * before any provider existed. (A caller-supplied transport counts as
 * configured: unit tests inject a fake transport with no SMTP env.)
 */
export async function processMailOutbox(
  options: {
    limit?: number;
    config?: MailConfig | null;
    transport?: Transporter;
  } = {},
): Promise<{
  sent: number;
  failed: number;
  remaining: number;
  skipped?: "unconfigured";
}> {
  const limit =
    options.limit !== undefined && options.limit > 0
      ? Math.min(options.limit, 100)
      : 25;
  const outcome: {
    sent: number;
    failed: number;
    remaining: number;
    skipped?: "unconfigured";
  } = { sent: 0, failed: 0, remaining: 0 };
  const config =
    options.config !== undefined ? options.config : getMailConfig();
  if (!config && options.transport === undefined) {
    // No provider and no injected transport: refuse the run before any
    // row is read, so no attempt is consumed. Count the pending rows
    // so the caller can still report how many are waiting.
    try {
      const service = createServiceClient();
      const { count } = await service
        .from("mail_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      outcome.remaining = count ?? 0;
    } catch {
      // The skipped run still never throws.
    }
    outcome.skipped = "unconfigured";
    return outcome;
  }
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("mail_outbox")
      .select("id, kind, to_email, subject, body_text, body_html, attempts")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error || !data) return outcome;
    const rows = data as unknown as MailOutboxRow[];

    for (const row of rows) {
      if (row.attempts >= MAIL_OUTBOX_MAX_ATTEMPTS) {
        await service
          .from("mail_outbox")
          .update({ status: "failed", last_error: "retry limit reached" })
          .eq("id", row.id);
        outcome.failed += 1;
        continue;
      }
      const result = await sendMail(
        {
          to: row.to_email,
          subject: row.subject,
          text: row.body_text,
          html: row.body_html ?? undefined,
        },
        {
          config: options.config,
          transport: options.transport,
          enqueue: false,
        },
      );
      if (result.sent) {
        await service
          .from("mail_outbox")
          .update({
            status: "sent",
            attempts: row.attempts + 1,
            sent_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        outcome.sent += 1;
      } else {
        const attempts = row.attempts + 1;
        const reason =
          result.skipped ?? result.error ?? "send failed";
        await service
          .from("mail_outbox")
          .update({
            attempts,
            last_error: reason.slice(0, 500),
            status: attempts >= MAIL_OUTBOX_MAX_ATTEMPTS ? "failed" : "pending",
          })
          .eq("id", row.id);
        outcome.failed += 1;
      }
    }

    const { count } = await service
      .from("mail_outbox")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    outcome.remaining = count ?? 0;
  } catch {
    // A retry run never throws; the admin page reports the counts it got.
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Templates (plain-text first)
// ---------------------------------------------------------------------------

export function orderPlacedCustomerEmail(input: {
  reference: string;
  totalMinor: number;
  orderUrl: string;
}): MailMessage {
  const text =
    `Thank you — your Gifto order ${input.reference} is confirmed.\n\n` +
    `Total (cash on delivery): ${formatEgp(input.totalMinor)}\n\n` +
    `Pay the courier in cash when your order arrives. You can follow it here:\n${input.orderUrl}\n\n` +
    `Each shop delivers its own items, so a multi-shop order may arrive in more than one delivery.`;
  return {
    to: "",
    subject: `Your Gifto order ${input.reference} is confirmed`,
    text,
    html: htmlWrap(
      `Your Gifto order ${input.reference} is confirmed`,
      text,
    ),
  };
}

export function orderPlacedVendorEmail(input: {
  vendorName: string;
  reference: string;
  subtotalMinor: number;
  itemCount: number;
  recipientName: string;
  contactPhone: string;
}): MailMessage {
  const text =
    `New Gifto order for ${input.vendorName}: ${input.reference}\n\n` +
    `${input.itemCount} ${input.itemCount === 1 ? "item" : "items"} · shop subtotal ${formatEgp(input.subtotalMinor)}\n` +
    `Recipient: ${input.recipientName} · ${input.contactPhone}\n\n` +
    `Open your Gifto vendor dashboard to confirm and prepare this order.`;
  return {
    to: "",
    subject: `New Gifto order ${input.reference} for ${input.vendorName}`,
    text,
    html: htmlWrap(`New Gifto order ${input.reference}`, text),
  };
}

export function orderStatusEmail(input: {
  reference: string;
  vendorName: string;
  previousStatus: OrderStatus;
  status: OrderStatus;
  orderUrl: string;
}): MailMessage {
  const text =
    `Update on your Gifto order ${input.reference} (${input.vendorName}):\n\n` +
    `${ORDER_STATUS_LABELS[input.previousStatus]} → ${ORDER_STATUS_LABELS[input.status]}\n\n` +
    `Follow your order here:\n${input.orderUrl}`;
  return {
    to: "",
    subject: `Your Gifto order ${input.reference} is now ${ORDER_STATUS_LABELS[input.status]}`,
    text,
    html: htmlWrap(
      `Your Gifto order ${input.reference} is now ${ORDER_STATUS_LABELS[input.status]}`,
      text,
    ),
  };
}

export function refundCaseOpenedEmail(input: {
  reference: string;
  vendorName: string;
}): MailMessage {
  const text =
    `We received your refund request for order ${input.reference} (${input.vendorName}).\n\n` +
    `The Gifto team will review it and reply here by email. Cash refunds are arranged directly with the shop, as explained on the refund policy page.`;
  return {
    to: "",
    subject: `Refund request received for order ${input.reference}`,
    text,
    html: htmlWrap(
      `Refund request received for order ${input.reference}`,
      text,
    ),
  };
}

export function refundCaseResolvedEmail(input: {
  reference: string;
  vendorName: string;
  approved: boolean;
  refundAmountMinor: number | null;
  note: string | null;
}): MailMessage {
  const decision = input.approved
    ? `approved for ${input.refundAmountMinor !== null ? formatEgp(input.refundAmountMinor) : "an amount the Gifto team will confirm"}`
    : "not approved";
  const text =
    `Your refund request for order ${input.reference} (${input.vendorName}) was ${decision}.\n\n` +
    (input.note ? `Note from Gifto: ${input.note}\n\n` : "") +
    (input.approved
      ? "The cash refund is arranged directly with the shop. If the shop has not contacted you within a few days, reply to this email or contact Gifto support."
      : "If you disagree with this decision, you can ask the Gifto team to review it once more from your order page.");
  return {
    to: "",
    subject: `Refund request ${input.approved ? "approved" : "not approved"} for order ${input.reference}`,
    text,
    html: htmlWrap(
      `Refund request ${input.approved ? "approved" : "not approved"} for order ${input.reference}`,
      text,
    ),
  };
}

export function supportStatusEmail(input: {
  subject: string;
  status: string;
}): MailMessage {
  const text =
    `Your Gifto support request "${input.subject}" is now: ${input.status}.\n\n` +
    `Open your vendor dashboard to see the request and any follow-up from the Gifto team.`;
  return {
    to: "",
    subject: `Support request update: ${input.subject}`,
    text,
    html: htmlWrap(`Support request update: ${input.subject}`, text),
  };
}

export function passwordResetEmail(input: {
  resetUrl: string;
}): MailMessage {
  const text =
    `You asked to reset your Gifto password.\n\n` +
    `Use this link to choose a new password (it expires after one hour and can be used once):\n${input.resetUrl}\n\n` +
    `If you did not ask for this, ignore this email — your password stays unchanged.`;
  return {
    to: "",
    subject: "Reset your Gifto password",
    text,
    html: htmlWrap("Reset your Gifto password", text),
  };
}

export function vendorStaffInviteEmail(input: {
  shopName: string;
  role: string;
  inviteUrl: string;
}): MailMessage {
  const text =
    `You have been invited to join ${input.shopName} on Gifto as ${input.role}.\n\n` +
    `Use this link to set your password and join the shop (it expires after 24 hours and can be used once):\n${input.inviteUrl}\n\n` +
    `If you were not expecting this invitation, ignore this email — no access has been granted yet.`;
  return {
    to: "",
    subject: `Invitation to join ${input.shopName} on Gifto`,
    text,
    html: htmlWrap(`Invitation to join ${input.shopName} on Gifto`, text),
  };
}

/** Sends the staff invitation link through the same mail module. */
export async function sendVendorStaffInviteEmail(
  email: string,
  shopName: string,
  role: string,
  inviteUrl: string,
): Promise<MailSendResult> {
  return sendMail(
    {
      ...vendorStaffInviteEmail({ shopName, role, inviteUrl }),
      to: email,
    },
    { enqueue: false },
  );
}

export function vendorStaffAddedEmail(input: {
  shopName: string;
  role: string;
}): MailMessage {
  const text =
    `You have been added to ${input.shopName} on Gifto as ${input.role}.\n\n` +
    `Sign in with your existing Gifto account to open the shop dashboard. ` +
    `If you cannot sign in, ask the shop owner to resend the invitation.`;
  return {
    to: "",
    subject: `You were added to ${input.shopName} on Gifto`,
    text,
    html: htmlWrap(`You were added to ${input.shopName} on Gifto`, text),
  };
}

/** Tells an existing account they were added to a shop (no invite link). */
export async function sendVendorStaffAddedEmail(
  email: string,
  shopName: string,
  role: string,
): Promise<MailSendResult> {
  return sendMail(
    {
      ...vendorStaffAddedEmail({ shopName, role }),
      to: email,
    },
    { kind: "staff_added" },
  );
}

// ---------------------------------------------------------------------------
// Notify helpers — each fetches what it needs through the service client and
// never throws. A missing recipient email means "no email to send to", not
// an error: the in-app page remains the source of truth.
// ---------------------------------------------------------------------------

type OrderNotificationRow = {
  id: string;
  public_reference: string | null;
  contact_email: string | null;
  total_minor: number;
  recipient_name: string;
  contact_phone: string;
  order_vendors: {
    id: string;
    subtotal_minor: number;
    vendor: { name: string; contact_email: string | null } | null;
    order_items: { quantity: number }[] | null;
  }[];
};

async function fetchOrderForMail(
  orderId: string,
): Promise<OrderNotificationRow | null> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("orders")
      .select(
        "id, public_reference, contact_email, total_minor, recipient_name, contact_phone, " +
          "order_vendors(id, subtotal_minor, vendor:vendors(name, contact_email), order_items(quantity))",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as OrderNotificationRow;
  } catch {
    return null;
  }
}

/** Vendor + customer email for a newly placed order. */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  const order = await fetchOrderForMail(orderId);
  if (!order) return;
  const reference = order.public_reference ?? `#${order.id.slice(0, 8)}`;
  const siteUrl = getSiteUrl();

  for (const suborder of order.order_vendors) {
    const vendor = suborder.vendor;
    if (!vendor?.contact_email) continue;
    const itemCount = (suborder.order_items ?? []).reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    await sendMail({
      ...orderPlacedVendorEmail({
        vendorName: vendor.name,
        reference,
        subtotalMinor: suborder.subtotal_minor,
        itemCount,
        recipientName: order.recipient_name,
        contactPhone: order.contact_phone,
      }),
      to: vendor.contact_email,
    },
    { kind: "order_placed_vendor" });
  }

  if (order.contact_email) {
    await sendMail({
      ...orderPlacedCustomerEmail({
        reference,
        totalMinor: order.total_minor,
        orderUrl: `${siteUrl}/orders/${order.id}`,
      }),
      to: order.contact_email,
    },
    { kind: "order_placed_customer" });
  }
}

/** Customer email when one of their suborders changes status. */
export async function notifyOrderStatusChanged(
  suborderId: string,
  previousStatus: OrderStatus,
  nextStatus: OrderStatus,
): Promise<void> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("order_vendors")
      .select(
        "order:orders(id, public_reference, contact_email), vendor:vendors(name)",
      )
      .eq("id", suborderId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as unknown as {
      order:
        | { id: string; public_reference: string | null; contact_email: string | null }
        | { id: string; public_reference: string | null; contact_email: string | null }[]
        | null;
      vendor: { name: string } | null;
    };
    const order = Array.isArray(row.order) ? row.order[0] : row.order;
    if (!order?.contact_email) return;
    const reference = order.public_reference ?? `#${order.id.slice(0, 8)}`;
    await sendMail({
      ...orderStatusEmail({
        reference,
        vendorName: row.vendor?.name ?? "Gifto",
        previousStatus,
        status: nextStatus,
        orderUrl: `${getSiteUrl()}/orders/${order.id}`,
      }),
      to: order.contact_email,
    },
    { kind: "order_status" });
  } catch {
    // A failed notification never rolls back the status change.
    return;
  }
}

/** Customer email when a refund case is opened. */
export async function notifyRefundCaseOpened(caseId: string): Promise<void> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("refund_cases")
      .select(
        "order:orders(id, public_reference, contact_email), vendor:vendors(name)",
      )
      .eq("id", caseId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as unknown as {
      order:
        | { id: string; public_reference: string | null; contact_email: string | null }
        | { id: string; public_reference: string | null; contact_email: string | null }[]
        | null;
      vendor: { name: string } | null;
    };
    const order = Array.isArray(row.order) ? row.order[0] : row.order;
    if (!order?.contact_email) return;
    const reference = order.public_reference ?? `#${order.id.slice(0, 8)}`;
    await sendMail({
      ...refundCaseOpenedEmail({
        reference,
        vendorName: row.vendor?.name ?? "Gifto",
      }),
      to: order.contact_email,
    },
    { kind: "refund_opened" });
  } catch {
    return;
  }
}

/** Customer email when a refund case is resolved. */
export async function notifyRefundCaseResolved(caseId: string): Promise<void> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("refund_cases")
      .select(
        "status, refund_amount_minor, resolution_note, order:orders(id, public_reference, contact_email), vendor:vendors(name)",
      )
      .eq("id", caseId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as unknown as {
      status: string;
      refund_amount_minor: number | null;
      resolution_note: string | null;
      order:
        | { id: string; public_reference: string | null; contact_email: string | null }
        | { id: string; public_reference: string | null; contact_email: string | null }[]
        | null;
      vendor: { name: string } | null;
    };
    const order = Array.isArray(row.order) ? row.order[0] : row.order;
    if (!order?.contact_email) return;
    if (row.status !== "approved" && row.status !== "rejected") return;
    const reference = order.public_reference ?? `#${order.id.slice(0, 8)}`;
    await sendMail({
      ...refundCaseResolvedEmail({
        reference,
        vendorName: row.vendor?.name ?? "Gifto",
        approved: row.status === "approved",
        refundAmountMinor: row.refund_amount_minor,
        note: row.resolution_note,
      }),
      to: order.contact_email,
    },
    { kind: "refund_resolved" });
  } catch {
    return;
  }
}

export function guestOrderRecoveryEmail(input: {
  reference: string;
  recoveryUrl: string;
  recoveryCode: string;
}): MailMessage {
  const text =
    `You asked to recover access to your Gifto order ${input.reference}.\n\n` +
    `Use this link to open your order again (it expires after one hour and can be used once):\n${input.recoveryUrl}\n\n` +
    // S-07: the code is printed separately from the link. If the link's
    // #token fragment is lost on the way (locale redirect, an email
    // client that strips fragments), the customer can still paste the
    // code on the confirmation page instead of being stuck.
    `If the link does not open your order, paste this recovery code on the confirmation page instead:\n${input.recoveryCode}\n\n` +
    `If you did not ask for this, ignore this email — your order link stays unchanged.`;
  return {
    to: "",
    subject: `Recover access to your Gifto order ${input.reference}`,
    text,
    html: htmlWrap(
      `Recover access to your Gifto order ${input.reference}`,
      text,
    ),
  };
}

/** Sends the guest-order recovery link through the same mail module. */
export async function sendGuestOrderRecoveryEmail(
  email: string,
  reference: string,
  recoveryUrl: string,
  recoveryCode: string,
): Promise<MailSendResult> {
  return sendMail(
    {
      ...guestOrderRecoveryEmail({ reference, recoveryUrl, recoveryCode }),
      to: email,
    },
    { enqueue: false },
  );
}

/** Sends the Supabase password-reset link through the same mail module. */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<MailSendResult> {
  return sendMail(
    {
      ...passwordResetEmail({ resetUrl }),
      to: email,
    },
    { enqueue: false },
  );
}

/** Vendor email when an admin changes a support request's status. */
export async function notifySupportRequestStatusChanged(
  requestId: string,
  status: string,
): Promise<void> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("support_requests")
      .select("subject, vendor:vendors(contact_email)")
      .eq("id", requestId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as unknown as {
      subject: string;
      vendor: { contact_email: string | null } | null;
    };
    if (!row.vendor?.contact_email) return;
    await sendMail({
      ...supportStatusEmail({ subject: row.subject, status }),
      to: row.vendor.contact_email,
    },
    { kind: "support_status" });
  } catch {
    return;
  }
}
