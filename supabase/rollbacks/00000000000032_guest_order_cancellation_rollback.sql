-- Rollback for 00000000000032_guest_order_cancellation.sql.
--
-- Drops cancel_guest_order(). Guest cancellation reverts to unsupported
-- (support requests only, as before P0-05). It does not alter order,
-- suborder, stock, or audit data.

drop function if exists public.cancel_guest_order(uuid, text);
