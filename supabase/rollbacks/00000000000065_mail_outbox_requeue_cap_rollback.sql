-- Rollback for migration 65 (mail-outbox requeue cap + first error).
--
-- Drops the requeue_count and first_error columns. Rolling back
-- reintroduces the S-10 gap by design: requeues become uncapped again
-- and the original failure reason is no longer preserved separately
-- from last_error. Only roll back on a disposable database, never on
-- hosted — the same guard as rollbacks 59/61/62/63/64.

alter table public.mail_outbox
  drop column if exists requeue_count,
  drop column if exists first_error;
