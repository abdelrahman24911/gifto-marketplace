-- Rollback for 00000000000069_support_admin_reply.sql.
-- Drops the admin-reply columns and restores the status-only update grant.
-- Replies are admin-written text; dropping them is the intended undo.

alter table public.support_requests
  drop constraint if exists support_requests_admin_reply_length;

revoke update (admin_reply, replied_at, replied_by)
  on table public.support_requests from authenticated;

alter table public.support_requests
  drop column if exists replied_by,
  drop column if exists replied_at,
  drop column if exists admin_reply;
