-- Gifto Marketplace - P0-05 (H-02): token-gated guest order cancellation.
--
-- Guest checkout (migration 11) has no self-service cancel: cancel_order()
-- (migration 5) requires orders.user_id = auth.uid(), and guest orders have
-- user_id NULL. A guest who changed their mind before any shop started had
-- no path except a support request.
--
-- This migration adds cancel_guest_order(p_order_id, p_token_hash), mirroring
-- cancel_order()'s rules and open_guest_refund_case()'s token-hash pattern
-- (migration 30): the caller proves ownership with the SHA-256 hash of the
-- guest token stored on the order — never the order id alone, a phone
-- number, or an email. The raw token never leaves the server.
--
-- Rules (exactly cancel_order()'s):
--   * No matching order id + token hash, or the order is not a guest order
--     (user_id is not NULL) -> generic "Order not found." (42501), revealing
--     nothing about whether the order exists.
--   * Parent must still be "placed" (no suborder has started). A second call
--     on an already-cancelled order is a no-op success: the desired end
--     state is already reached and stock must never be restocked twice.
--   * Every suborder is cancelled; the existing restock trigger returns
--     stock and logs movements, and the migration-28 audit trigger records
--     the cancellations (actor "system": the service-role call carries no
--     auth.uid(), so the trigger infers system — verified in the test).
--   * REVOKE from public, anon, authenticated; GRANT EXECUTE to service_role
--     only. The server action calls it through the quarantined service-role
--     client, exactly like the guest refund actions.
--
-- Regression test: supabase/tests/rls_guest_orders_test.sql, TEST 15-19.

create or replace function public.cancel_guest_order(
  p_order_id uuid,
  p_token_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.user_id is null
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
  ) then
    raise exception 'Order not found.' using errcode = '42501';
  end if;

  select status
    into v_status
    from public.orders
   where id = p_order_id
   for update;

  -- Idempotent: an already-cancelled order is already in the desired end
  -- state. Return without touching anything so stock is never restocked
  -- twice.
  if v_status = 'cancelled' then
    return;
  end if;

  if v_status <> 'placed' then
    raise exception 'Only orders that no shop has started processing can be cancelled.'
      using errcode = '23514';
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;

  -- Each suborder cancellation restores its stock via the restock trigger
  -- and is recorded by the migration-28 audit trigger.
  update public.order_vendors
     set status = 'cancelled'
   where order_id = p_order_id
     and status <> 'cancelled';
end;
$$;

revoke all on function public.cancel_guest_order(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_guest_order(uuid, text) to service_role;

comment on function public.cancel_guest_order(uuid, text) is
  'Guest self-service cancellation (P0-05, H-02). Token-hash gated, service-role only; mirrors cancel_order() placed-only rule and restock semantics. A second call on a cancelled order is a no-op.';
