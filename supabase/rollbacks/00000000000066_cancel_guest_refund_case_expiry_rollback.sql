-- Rollback for 00000000000066_cancel_guest_refund_case_expiry.sql.
--
-- Restores the migration 45 definition of cancel_guest_refund_case, which
-- verifies the token hash but not guest_token_expires_at. No table, data,
-- constraint or grant changes. Only run on a disposable database, never on
-- hosted.

create or replace function public.cancel_guest_refund_case(
  p_order_id uuid,
  p_token_hash text,
  p_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
  ) then
    raise exception 'This order link is not valid.' using errcode = '42501';
  end if;

  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
     and rc.order_id = p_order_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if v_case.source <> 'guest' or v_case.opened_by is not null then
    raise exception 'This refund case was not opened as a guest.'
      using errcode = '42501';
  end if;

  if v_case.status <> 'open' then
    raise exception 'This refund case is no longer open.' using errcode = '23514';
  end if;

  update public.refund_cases
     set status = 'cancelled',
         refund_amount_minor = 0,
         resolved_by = null,
         resolved_at = now()
   where id = p_case_id;
end;
$$;

revoke all on function public.cancel_guest_refund_case(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_guest_refund_case(uuid, text, uuid)
  to service_role;

comment on function public.cancel_guest_refund_case(uuid, text, uuid) is
  'Guest cancels their own open refund case (N-03, D-09). Service-role only, token-hash verified, opened_by IS NULL + source guest. No money, stock, or settlement effect.';
