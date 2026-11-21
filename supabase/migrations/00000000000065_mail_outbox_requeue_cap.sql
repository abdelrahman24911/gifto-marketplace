-- Migration 65 — Cap mail-outbox requeues and preserve the first error
-- (re-audit v8, S-10, LOW).
--
-- Migration 63 + S-06 gave a terminally failed outbox row a requeue path,
-- but the requeue was uncapped: an admin could loop requeue → retry →
-- requeue indefinitely, so "failed after 5 attempts" became advisory
-- rather than terminal. Requeue also overwrote last_error with a generic
-- note, losing the original failure reason (e.g. "connection refused")
-- from the row. This migration adds the two columns the mail module
-- needs to close both gaps:
--   * requeue_count: how many times the row has been requeued. The
--     mail module refuses a further requeue once it reaches
--     MAIL_OUTBOX_MAX_REQUEUES (2): a row gets at most two fresh retry
--     cycles after terminal failure, then it stays failed.
--   * first_error: the reason the row first failed, set at enqueue and
--     never overwritten afterwards. Later failures update last_error
--     only, so the original reason stays answerable from the row even
--     after retries and requeues.
-- Backfill: existing rows get first_error = last_error (the only
-- failure reason they have on record). No RLS change: the table stays
-- admin-read-only, written only through the service-role mail module.

alter table public.mail_outbox
  add column requeue_count int not null default 0 check (requeue_count >= 0),
  add column first_error text;

update public.mail_outbox
  set first_error = last_error
  where first_error is null
    and last_error is not null;

comment on column public.mail_outbox.requeue_count is
  'Mail outbox requeues (migration 65, S-10): how many times a terminally failed row has been requeued for a fresh retry cycle. Refused once it reaches MAIL_OUTBOX_MAX_REQUEUES (2).';
comment on column public.mail_outbox.first_error is
  'Mail outbox first failure (migration 65, S-10): the reason the row first failed, set at enqueue and never overwritten — last_error keeps changing on retries, first_error does not.';
