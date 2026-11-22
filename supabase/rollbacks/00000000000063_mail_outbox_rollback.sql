-- Rollback for migration 63 (mail outbox).
--
-- Drops the mail_outbox table. Rolling back removes the durable retry
-- queue: skipped/failed sends go back to log-only, and any queued
-- messages that were never retried are deleted with the table. Only
-- roll back if the outbox itself must be removed.

drop table if exists public.mail_outbox;
