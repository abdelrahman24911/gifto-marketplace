-- Migration 63 — Mail outbox (re-audit v6, MEDIUM): a durable retry
-- queue for skipped/failed SMTP sends.
--
-- Until now a send that was skipped (no SMTP provider configured) or
-- failed (transport error) existed only as a console log line: ops had
-- to re-read the log, rebuild the message by hand and resend it, and a
-- restart or log rotation lost it entirely. This migration adds a
-- small outbox table that sendMail writes to on every skipped/failed
-- send, and that an admin can retry from /admin/mail-outbox:
--   * mail_outbox: one row per undelivered message — recipient,
--     subject, plain-text + HTML bodies, kind, status
--     (pending/sent/failed), attempt count, last error, created/sent
--     times. No message content is ever updated in place; a retry
--     only flips status/attempts, so the queued text is the audit
--     record of what was (not) sent.
--   * RLS is admin-read-only: no insert/update/delete policy exists,
--     so rows can only be written through the SECURITY DEFINER
--     service-role client used by the mail module (sendMail's enqueue
--     and processMailOutbox). The table is not reachable from any
--     customer or vendor session.
--   * NOT enqueued, by design: guest-order recovery, password-reset
--     and staff-invite emails. Their bodies carry single-use links or
--     tokens, and a retry after the link expires is useless — while
--     persisting the raw token in the outbox would widen its exposure.
--     Those sends keep the log-only behaviour; every other
--     notification (order placed/status, refund opened/resolved,
--     support status, staff added) is enqueued.
--   * No automatic worker exists yet: there is no cron infrastructure
--     in this repo (no vercel.json, no CRON_SECRET), so retries are
--     admin-triggered from /admin/mail-outbox. A future cron route can
--     call processMailOutbox with the same code path when cron is set
--     up; nothing about the table needs to change for that.
--   * Retries stop after 5 attempts: the row is marked 'failed'
--     (terminal) so a permanently undeliverable address cannot spin
--     forever. An admin can still see the failed row and its error.

create table public.mail_outbox (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null,
  to_email             text not null,
  subject              text not null,
  body_text            text not null,
  body_html            text,
  status               text not null default 'pending'
                       check (status in ('pending', 'sent', 'failed')),
  attempts             int not null default 0 check (attempts >= 0),
  last_error           text,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);

comment on table public.mail_outbox is
  'Mail outbox (migration 63): durable retry queue for notification emails skipped (no SMTP provider) or failed (transport error). Admin-read-only; written only by the mail module through the service role. Recovery, password-reset and staff-invite emails are never enqueued — their single-use links must not be persisted.';

alter table public.mail_outbox enable row level security;

create index mail_outbox_pending_idx
  on public.mail_outbox (created_at asc)
  where status = 'pending';

create policy "mail_outbox: platform admin read"
  on public.mail_outbox for select
  using (public.is_platform_admin());

revoke all on table public.mail_outbox from public, anon, authenticated;
grant select on table public.mail_outbox to authenticated, service_role;
