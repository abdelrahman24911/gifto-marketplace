import "server-only";

import nodemailer from "nodemailer";

import { PUBLIC_REFERENCE_PATTERN } from "./guest-order";
import { parseEnvironment } from "./environment";
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
 * mail_outbox table (migration 63) so they can be retried from
 * /admin/mail-outbox or automatically by the cron route
 * (/api/cron/mail-outbox, scheduled in vercel.json); recovery,
 * password-reset and new-account staff-invite emails are never enqueued —
 * their single-use links must not be persisted, and a retry after expiry
 * would be useless. Existing-account staff notices carry no token and are
 * safe to retry through the outbox.
 *
 * Templates are plain-text first; the HTML body is the same content in a
 * minimal wrapper. Amounts use the existing EGP formatter (integer
 * piasters). No guest token, reset link, or credential is ever logged.
 *
 * Demo boundary (P5): when GIFTO_ENVIRONMENT is "demo", every send is
 * refused with `skipped: "demo-environment"` unless the owner opted in
 * with GIFTO_DEMO_ALLOW_EMAIL=true. A demo deployment must never send
 * a real email to a real customer — a demo notification looks exactly
 * like a real Gifto email. The outbox retry refuses the same way, so a
 * demo retry can never burn attempts or leak a send.
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
  | {
      sent: false;
      skipped?: "unconfigured" | "demo-environment";
      error?: string;
    };

/** Kinds of notification that may be queued in mail_outbox. */
export type MailOutboxKind =
  | "order_placed_customer"
  | "order_placed_vendor"
  | "order_placed_admin"
  | "order_status"
  | "refund_opened"
  | "refund_resolved"
  | "support_status"
  | "staff_invited"
  | "notification";

/** A retry stops permanently after this many failed attempts. */
export const MAIL_OUTBOX_MAX_ATTEMPTS = 5;

/**
 * A terminally failed row may be requeued this many times (S-10). Each
 * requeue starts a fresh retry cycle of up to MAIL_OUTBOX_MAX_ATTEMPTS,
 * so the bound on total attempts per row is 5 + 2 × 5 — and after that
 * the row stays failed for good. An uncapped requeue made the terminal
 * cap advisory for a determined admin; the cap makes it bind again.
 */
export const MAIL_OUTBOX_MAX_REQUEUES = 2;

/** Outcome of a requeue attempt: the cap is a distinct refusal. */
export type RequeueMailOutboxResult =
  | { ok: true }
  | { ok: false; reason: "not_failed" | "cap_reached" };

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

/**
 * Demo-environment mail boundary (P5 demo separation).
 *
 * A demo deployment must never send a real email to a real customer:
 * demo data is test data, and a notification that escapes the demo
 * looks exactly like a real Gifto email. Sending is therefore blocked
 * whenever GIFTO_ENVIRONMENT is "demo", unless the owner explicitly
 * opts in with GIFTO_DEMO_ALLOW_EMAIL=true — an opt-in that belongs
 * only in the isolated demo deployment, for test sends, never in
 * production. The block applies even to an injected transport (unit
 * tests inject one): the environment, not the configuration, decides.
 * An unparseable GIFTO_ENVIRONMENT is not "demo", so a misconfigured
 * value does not silently block production mail — the deployment
 * preflight fails on unknown values instead.
 */
export function isMailBlockedInDemo(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    parseEnvironment(env.GIFTO_ENVIRONMENT) === "demo" &&
    env.GIFTO_DEMO_ALLOW_EMAIL?.trim().toLowerCase() !== "true"
  );
}

function logDemoBlocked(to: string, subject: string): void {
  console.error(
    `[gifto-mail] NOT SENT to=${redactEmail(to)} subject="${subject}": ` +
      "sending is disabled in the demo environment (GIFTO_ENVIRONMENT=demo). " +
      "No real customer email may leave a demo deployment; set " +
      "GIFTO_DEMO_ALLOW_EMAIL=true only in the isolated demo deployment " +
      "if test sends are needed.",
  );
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

function redactEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "***";
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}

function redactEmailAddresses(text: string): string {
  return text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, redactEmail);
}

function logSkipped(to: string, subject: string, reason: string): void {
  console.error(
    `[gifto-mail] NOT SENT to=${redactEmail(to)} subject="${subject}": ${reason}. ` +
      "Configure SMTP_HOST and MAIL_FROM (see .env.example) and retry from the ops log.",
  );
}

function logFailed(to: string, subject: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(
    `[gifto-mail] FAILED to=${redactEmail(to)} subject="${subject}": ${redactEmailAddresses(message)}. ` +
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

  // P5: a demo environment never sends real email unless the owner
  // explicitly opted in. The send is still enqueued (like the
  // unconfigured path) so the attempt stays answerable from the
  // outbox — but a retry is refused again while the block is on.
  if (isMailBlockedInDemo()) {
    logDemoBlocked(message.to, message.subject);
    if (overrides.enqueue !== false) {
      await enqueueMailOutbox(
        message,
        overrides.kind ?? "notification",
        "demo environment: sending disabled",
      );
    }
    return { sent: false, skipped: "demo-environment" };
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
      // S-10: the first failure reason is recorded once and never
      // overwritten — later retries update last_error only, so the
      // original reason stays answerable from the row.
      first_error: reason.slice(0, 500),
    });
    if (error) {
      console.error(
        `[gifto-mail] outbox enqueue failed to=${redactEmail(message.to)} subject="${message.subject}": ${redactEmailAddresses(error.message)}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      `[gifto-mail] outbox enqueue failed to=${redactEmail(message.to)} subject="${message.subject}": ${redactEmailAddresses(error instanceof Error ? error.message : "unknown error")}`,
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
  first_error: string | null;
};

/**
 * Requeues one terminally failed outbox row (migration 63, S-06) so it
 * can be retried again once SMTP is configured. Only a row already in
 * 'failed' moves: a pending or sent row is left untouched and the call
 * returns `{ ok: false, reason: "not_failed" }`. Attempts reset to 0 —
 * the requeue starts a fresh retry cycle; the 5-attempt cap still
 * applies to the new cycle. Never throws.
 *
 * S-10: requeues are capped at MAIL_OUTBOX_MAX_REQUEUES per row. Once
 * the row has been requeued that many times, a further requeue is
 * refused with `{ ok: false, reason: "cap_reached" }` and the row stays
 * terminally failed. The original failure reason is preserved: the
 * requeue leaves last_error untouched (it still says what actually
 * failed) and first_error holds the very first failure reason — the
 * previous behaviour overwrote last_error with a generic requeue note
 * and lost both.
 *
 * S-14: the cap check is atomic at the row, not just in application
 * code. The read above only decides the *expected* requeue_count; the
 * update itself is conditional on `status = 'failed'` AND
 * `requeue_count = <read value>`, and it selects the updated row back.
 * If two requeues race (double-click, two admins), the loser's update
 * matches zero rows — the winner already flipped the row to pending
 * and bumped the count — and is refused instead of granting an extra
 * retry cycle. The same guard covers a row that was sent (or failed
 * again) between the read and the update. Zero affected rows is a
 * refusal, not a success.
 */
export async function requeueMailOutbox(
  rowId: string,
): Promise<RequeueMailOutboxResult> {
  if (!rowId) return { ok: false, reason: "not_failed" };
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("mail_outbox")
      .select("id, status, requeue_count")
      .eq("id", rowId)
      .maybeSingle();
    const row = data as unknown as {
      id: string;
      status: string;
      requeue_count?: number | null;
    } | null;
    if (error || !row || row.status !== "failed") {
      return { ok: false, reason: "not_failed" };
    }
    const requeueCount = row.requeue_count ?? 0;
    if (requeueCount >= MAIL_OUTBOX_MAX_REQUEUES) {
      return { ok: false, reason: "cap_reached" };
    }
    const {
      data: updated,
      error: updateError,
    } = await service
      .from("mail_outbox")
      .update({
        status: "pending",
        attempts: 0,
        requeue_count: requeueCount + 1,
      })
      .eq("id", rowId)
      // S-14: conditional on the state the read just saw. A concurrent
      // requeue (or a send) that already moved the row makes this match
      // zero rows, and zero affected rows is a refusal.
      .eq("status", "failed")
      .eq("requeue_count", requeueCount)
      .select("id");
    if (updateError || !updated || updated.length === 0) {
      return { ok: false, reason: "not_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "not_failed" };
  }
}

/**
 * Retries pending outbox rows, oldest first (admin-triggered from
 * /admin/mail-outbox, and automatically by the cron route
 * /api/cron/mail-outbox once daily). Each row is sent with
 * `enqueue: false` so a failed retry never re-enqueues itself. After
 * MAIL_OUTBOX_MAX_ATTEMPTS the row is marked 'failed' (terminal)
 * instead of spinning forever. Terminally failed rows are never picked
 * up here: only an admin requeue (capped by migration 65 / S-10) moves
 * them back to pending. Never throws.
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
  skipped?: "unconfigured" | "demo-environment";
}> {
  const limit =
    options.limit !== undefined && options.limit > 0
      ? Math.min(options.limit, 100)
      : 25;
  const outcome: {
    sent: number;
    failed: number;
    remaining: number;
    skipped?: "unconfigured" | "demo-environment";
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
  if (isMailBlockedInDemo()) {
    // P5: a retry run in a demo environment does nothing at all — same
    // shape as the unconfigured refusal, so no attempt is burned and no
    // row is touched. The rows stay pending for a deployment where
    // sending is allowed.
    try {
      const service = createServiceClient();
      const { count } = await service
        .from("mail_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      outcome.remaining = count ?? 0;
    } catch {
      // The refused run still never throws.
    }
    outcome.skipped = "demo-environment";
    return outcome;
  }
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("mail_outbox")
      .select(
        "id, kind, to_email, subject, body_text, body_html, attempts, first_error",
      )
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
            // S-10: first_error is set at enqueue and never overwritten.
            // Rows written before migration 65 have none, so a failure
            // here fills it in once — after that it is left alone.
            first_error: row.first_error ?? reason.slice(0, 500),
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

export type OrderMailItem = {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type OrderMailVendor = {
  id: string;
  vendorId: string;
  vendorName: string;
  dashboardUrl: string;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  items: OrderMailItem[];
};

export type OrderMailDetails = {
  reference: string;
  orderUrl: string;
  adminUrl: string;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  recipientName: string;
  contactPhone: string;
  contactEmail: string | null;
  addressLine: string;
  city: string;
  governorate: string;
  notes: string | null;
  giftWrap: boolean;
  giftMessage: string | null;
  preferredDeliveryDate: string | null;
  deliveryTimeNote: string | null;
  vendors: OrderMailVendor[];
};

function formatItemLines(items: OrderMailItem[]): string {
  if (items.length === 0) return "- No items";
  return items
    .map((item) => {
      const unit =
        item.quantity > 1
          ? ` (${formatEgp(item.unitPriceMinor)} each)`
          : "";
      return `- ${item.name} x ${item.quantity} - ${formatEgp(item.lineTotalMinor)}${unit}`;
    })
    .join("\n");
}

function formatDeliveryFee(minor: number): string {
  return minor === 0 ? "Free" : formatEgp(minor);
}

function formatCustomerBlock(input: OrderMailDetails): string {
  const lines = [input.recipientName, input.contactPhone];
  if (input.contactEmail) lines.push(input.contactEmail);
  lines.push(input.addressLine, `${input.city}, ${input.governorate}`);
  if (input.notes) lines.push(`Delivery notes: ${input.notes}`);
  return lines.join("\n");
}

function formatGiftBlock(input: OrderMailDetails): string {
  const lines: string[] = [];
  if (input.giftWrap) lines.push("Gift wrap: Yes");
  if (input.giftMessage) lines.push(`Gift message: ${input.giftMessage}`);
  if (input.preferredDeliveryDate) {
    lines.push(`Preferred delivery date: ${input.preferredDeliveryDate}`);
  }
  if (input.deliveryTimeNote) {
    lines.push(`Preferred delivery time: ${input.deliveryTimeNote}`);
  }
  return lines.join("\n");
}

function section(title: string, body: string): string {
  return body ? `${title}\n${"-".repeat(title.length)}\n${body}\n\n` : "";
}

function formatVendorBlock(vendor: OrderMailVendor): string {
  const lines = [
    vendor.vendorName,
    formatItemLines(vendor.items),
    `Shop subtotal: ${formatEgp(vendor.subtotalMinor)}`,
  ];
  if (vendor.deliveryFeeMinor > 0) {
    lines.push(`Delivery: ${formatEgp(vendor.deliveryFeeMinor)}`);
  }
  return lines.join("\n");
}

function formatVendorSummary(input: OrderMailDetails): string {
  if (input.vendors.length === 0) return "No shop items";
  return input.vendors.map(formatVendorBlock).join("\n\n");
}

export function orderPlacedCustomerEmail(
  input: OrderMailDetails,
): MailMessage {
  const gift = formatGiftBlock(input);
  const text =
    `Thank you - your Gifto order ${input.reference} is confirmed.\n\n` +
    section("Order details", formatVendorSummary(input)) +
    `Subtotal: ${formatEgp(input.subtotalMinor)}\n` +
    `Delivery: ${formatDeliveryFee(input.deliveryFeeMinor)}\n` +
    `Total (cash on delivery): ${formatEgp(input.totalMinor)}\n\n` +
    section("Deliver to", formatCustomerBlock(input)) +
    section("Gift options", gift) +
    `Pay the courier in cash when your order arrives. Follow it here:\n${input.orderUrl}\n\n` +
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

export function orderPlacedVendorEmail(
  input: OrderMailDetails,
  vendor: OrderMailVendor,
): MailMessage {
  const gift = formatGiftBlock(input);
  const text =
    `New Gifto order for ${vendor.vendorName}: ${input.reference}\n\n` +
    section("Items", formatItemLines(vendor.items)) +
    `Shop subtotal: ${formatEgp(vendor.subtotalMinor)}\n` +
    (vendor.deliveryFeeMinor > 0
      ? `Delivery: ${formatEgp(vendor.deliveryFeeMinor)}\n`
      : "") +
    `\n` +
    section("Deliver to", formatCustomerBlock(input)) +
    section("Gift options", gift) +
    `Open your Gifto vendor dashboard to confirm and prepare this order:\n${vendor.dashboardUrl}`;
  return {
    to: "",
    subject: `New Gifto order ${input.reference} for ${vendor.vendorName}`,
    text,
    html: htmlWrap(`New Gifto order ${input.reference}`, text),
  };
}

export function orderPlacedAdminEmail(input: OrderMailDetails): MailMessage {
  const gift = formatGiftBlock(input);
  const text =
    `New Gifto order ${input.reference}\n\n` +
    section("Deliver to", formatCustomerBlock(input)) +
    section("Gift options", gift) +
    `Subtotal: ${formatEgp(input.subtotalMinor)}\n` +
    `Delivery: ${formatDeliveryFee(input.deliveryFeeMinor)}\n` +
    `Total (cash on delivery): ${formatEgp(input.totalMinor)}\n\n` +
    section("Shops and items", formatVendorSummary(input)) +
    `Open the admin order page:\n${input.adminUrl}`;
  return {
    to: "",
    subject: `New Gifto order ${input.reference}`,
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
  reply?: string;
}): MailMessage {
  const replyText = input.reply?.trim()
    ? `\n\nGifto replied:\n${input.reply.trim()}\n`
    : "";
  const text =
    `Your Gifto support request "${input.subject}" is now: ${input.status}.\n` +
    replyText +
    `\nOpen your vendor dashboard to see the request and any follow-up from the Gifto team.`;
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
    `Use this link to set your password and continue to your invitations page (it expires after 24 hours and can be used once):\n${input.inviteUrl}\n\n` +
    `No access is granted until you accept the invitation. If you were not expecting this invitation, ignore this email.`;
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

export function vendorStaffPendingInviteEmail(input: {
  shopName: string;
  role: string;
  invitationsUrl: string;
}): MailMessage {
  const text =
    `You have been invited to join ${input.shopName} on Gifto as ${input.role}.\n\n` +
    `Sign in to your Gifto account and accept the invitation here:\n${input.invitationsUrl}\n\n` +
    `No access is granted until you accept. This invitation expires after 7 days. ` +
    `If you were not expecting it, ignore this email.`;
  return {
    to: "",
    subject: `Invitation to join ${input.shopName} on Gifto`,
    text,
    html: htmlWrap(`Invitation to join ${input.shopName} on Gifto`, text),
  };
}

export async function sendVendorStaffPendingInviteEmail(
  email: string,
  shopName: string,
  role: string,
  invitationsUrl: string,
): Promise<MailSendResult> {
  return sendMail(
    {
      ...vendorStaffPendingInviteEmail({
        shopName,
        role,
        invitationsUrl,
      }),
      to: email,
    },
    { kind: "staff_invited" },
  );
}

// ---------------------------------------------------------------------------
// Notify helpers — each fetches what it needs through the service client and
// never throws. A missing recipient email means "no email to send to", not
// an error: the in-app page remains the source of truth.
// ---------------------------------------------------------------------------

type OrderNotificationRow = {
  id: string;
  user_id: string | null;
  public_reference: string | null;
  contact_email: string | null;
  subtotal_minor: number;
  delivery_fee_minor: number;
  total_minor: number;
  recipient_name: string;
  contact_phone: string;
  address_line: string;
  city: string;
  governorate: string;
  notes: string | null;
  gift_wrap: boolean;
  gift_message: string | null;
  preferred_delivery_date: string | null;
  delivery_time_note: string | null;
  order_vendors: {
    id: string;
    vendor_id: string;
    subtotal_minor: number;
    delivery_fee_minor: number;
    vendor: { name: string; contact_email: string | null } | null;
    order_items: {
      product_name: string;
      quantity: number;
      unit_price_minor: number;
      line_total_minor: number;
    }[] | null;
  }[];
};

/**
 * The order URL in customer email must work in the recipient's browser:
 * signed-in customers use their account page; guests use the recovery page
 * with their public reference. The guest token is never included.
 */
export function customerOrderUrl(
  order: {
    id: string;
    user_id: string | null;
    public_reference: string | null;
  },
  siteUrl: string = getSiteUrl(),
): string {
  if (order.user_id) {
    return `${siteUrl}/account/orders/${order.id}`;
  }
  if (
    order.public_reference &&
    PUBLIC_REFERENCE_PATTERN.test(order.public_reference)
  ) {
    return `${siteUrl}/orders/recover?reference=${encodeURIComponent(order.public_reference)}`;
  }
  return `${siteUrl}/orders/${order.id}`;
}

async function fetchOrderForMail(
  orderId: string,
): Promise<OrderNotificationRow | null> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("orders")
      .select(
        "id, user_id, public_reference, contact_email, subtotal_minor, delivery_fee_minor, total_minor, recipient_name, contact_phone, address_line, city, governorate, notes, gift_wrap, gift_message, preferred_delivery_date, delivery_time_note, " +
          "order_vendors(id, vendor_id, subtotal_minor, delivery_fee_minor, vendor:vendors(name, contact_email), order_items(product_name, quantity, unit_price_minor, line_total_minor))",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as OrderNotificationRow;
  } catch {
    return null;
  }
}

function parseAdminRecipients(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(/[,;]/)
        .map((email) => email.trim())
        .filter((email) => EMAIL_PATTERN.test(email)),
    ),
  ];
}

export function getConfiguredAdminRecipients(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return parseAdminRecipients(env.MAIL_ADMIN_TO);
}

async function resolveAdminRecipients(): Promise<string[]> {
  const configured = getConfiguredAdminRecipients();
  if (configured.length > 0) return configured;
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("profiles")
      .select("email")
      .eq("is_platform_admin", true);
    if (error || !data) return [];
    return [
      ...new Set(
        data
          .map((row: { email: string | null }) => row.email)
          .filter(
            (email): email is string =>
              typeof email === "string" && EMAIL_PATTERN.test(email),
          ),
      ),
    ];
  } catch {
    return [];
  }
}

function toOrderMailDetails(
  order: OrderNotificationRow,
  siteUrl: string,
): OrderMailDetails {
  return {
    reference: order.public_reference ?? `#${order.id.slice(0, 8)}`,
    orderUrl: customerOrderUrl(order, siteUrl),
    adminUrl: `${siteUrl}/admin/orders/${order.id}`,
    subtotalMinor: order.subtotal_minor,
    deliveryFeeMinor: order.delivery_fee_minor,
    totalMinor: order.total_minor,
    recipientName: order.recipient_name,
    contactPhone: order.contact_phone,
    contactEmail: order.contact_email,
    addressLine: order.address_line,
    city: order.city,
    governorate: order.governorate,
    notes: order.notes,
    giftWrap: order.gift_wrap,
    giftMessage: order.gift_message,
    preferredDeliveryDate: order.preferred_delivery_date,
    deliveryTimeNote: order.delivery_time_note,
    vendors: order.order_vendors.map((suborder) => ({
      id: suborder.id,
      vendorId: suborder.vendor_id,
      vendorName: suborder.vendor?.name ?? "Gifto shop",
      dashboardUrl: `${siteUrl}/vendor/orders/${suborder.id}?vendor=${encodeURIComponent(suborder.vendor_id)}`,
      subtotalMinor: suborder.subtotal_minor,
      deliveryFeeMinor: suborder.delivery_fee_minor,
      items: (suborder.order_items ?? []).map((item) => ({
        name: item.product_name,
        quantity: item.quantity,
        unitPriceMinor: item.unit_price_minor,
        lineTotalMinor: item.line_total_minor,
      })),
    })),
  };
}

/**
 * Customer + vendor + admin email for a newly placed order.
 *
 * Never throws: the order is already placed when this runs, so a broken
 * site URL, a missing order row, or a failed send must not turn a
 * successful checkout into an error for the customer — the send is
 * enqueued to mail_outbox (or logged) instead. The other notifiers wrap
 * the same way; this one was the only one that could still throw, via
 * getSiteUrl() rejecting a localhost site URL in production.
 */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  try {
    await notifyOrderPlacedInner(orderId);
  } catch (error) {
    // A failed notification never rolls back the placed order.
    console.error(
      "[gifto-mail] order-placed notification failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

async function notifyOrderPlacedInner(orderId: string): Promise<void> {
  const order = await fetchOrderForMail(orderId);
  if (!order) return;
  const siteUrl = getSiteUrl();
  const details = toOrderMailDetails(order, siteUrl);
  const sends: Promise<MailSendResult>[] = [];

  for (const suborder of order.order_vendors) {
    const vendor = suborder.vendor;
    const detailsForVendor = details.vendors.find(
      (entry) => entry.id === suborder.id,
    );
    if (!vendor?.contact_email || !detailsForVendor) continue;
    sends.push(
      sendMail(
        {
          ...orderPlacedVendorEmail(details, detailsForVendor),
          to: vendor.contact_email,
        },
        { kind: "order_placed_vendor" },
      ),
    );
  }

  if (order.contact_email) {
    sends.push(
      sendMail(
        {
          ...orderPlacedCustomerEmail(details),
          to: order.contact_email,
        },
        { kind: "order_placed_customer" },
      ),
    );
  }

  const adminRecipients = await resolveAdminRecipients();
  for (const to of adminRecipients) {
    sends.push(
      sendMail(
        { ...orderPlacedAdminEmail(details), to },
        { kind: "order_placed_admin" },
      ),
    );
  }

  await Promise.all(sends);
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
        "order:orders(id, user_id, public_reference, contact_email), vendor:vendors(name)",
      )
      .eq("id", suborderId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as unknown as {
      order:
        | {
            id: string;
            user_id: string | null;
            public_reference: string | null;
            contact_email: string | null;
          }
        | {
            id: string;
            user_id: string | null;
            public_reference: string | null;
            contact_email: string | null;
          }[]
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
        orderUrl: customerOrderUrl(order),
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
  reply?: string,
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
      ...supportStatusEmail({ subject: row.subject, status, reply }),
      to: row.vendor.contact_email,
    },
    { kind: "support_status" });
  } catch {
    return;
  }
}
