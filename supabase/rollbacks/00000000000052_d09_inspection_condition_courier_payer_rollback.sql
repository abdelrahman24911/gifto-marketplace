-- Rollback for migration 52 (R-05 D-09 inspection condition / courier payer).
--
-- Restores migration 35's confirm_refund_receipt (2 arguments, no
-- condition) and restock_refund_case (no condition bans), and drops the
-- inspection_condition / return_courier_paid_by columns and their
-- constraint. Rolling back REINTRODUCES R-05: a damaged return can again
-- be restocked, and no field records who pays the return courier. Only
-- roll back if the R-05 enforcement itself must be removed.

alter table public.refund_cases
  drop constraint if exists refund_cases_courier_payer_matches;

alter table public.refund_cases
  drop column if exists return_courier_paid_by,
  drop column if exists inspection_condition;

drop function if exists public.confirm_refund_receipt(uuid, text, text);

create or replace function public.confirm_refund_receipt(
  p_case_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case     record;
  v_suborder record;
begin
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'A receipt note must be 1000 characters or fewer.'
      using errcode = '22023';
  end if;

  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if not public.is_vendor_manager(v_case.vendor_id) then
    raise exception 'Only the shop that owns this order can confirm receipt of its return.'
      using errcode = '42501';
  end if;

  if v_case.status <> 'approved' then
    raise exception 'Only an approved refund can have its return confirmed.'
      using errcode = '23514';
  end if;

  if v_case.return_path <> 'physical_return' then
    raise exception 'This refund was approved without a physical return.'
      using errcode = '23514';
  end if;

  if v_case.received_at is not null then
    raise exception 'This return was already confirmed received.'
      using errcode = '23514';
  end if;

  update public.refund_cases
     set received_at = now(),
         received_by = auth.uid(),
         receipt_note = nullif(trim(p_note), '')
   where id = p_case_id;

  select ov.id, ov.status
    into v_suborder
    from public.order_vendors ov
   where ov.id = v_case.order_vendor_id
   for update;

  if v_suborder.id is not null
     and v_suborder.status in ('delivered', 'shipped') then
    perform set_config('gifto.refund_receipt_case', p_case_id::text, true);
    begin
      perform public.set_order_vendor_status(
        v_suborder.id,
        'returned'::public.order_status,
        v_suborder.status,
        'customer_request',
        'Return received for refund case ' || p_case_id::text
      );
    exception when others then
      perform set_config('gifto.refund_receipt_case', '', true);
      raise;
    end;
    perform set_config('gifto.refund_receipt_case', '', true);
  end if;
end;
$$;

revoke all on function public.confirm_refund_receipt(uuid, text) from public, anon;
grant execute on function public.confirm_refund_receipt(uuid, text) to authenticated;

create or replace function public.restock_refund_case(
  p_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
  v_item record;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can restock a return.'
      using errcode = '42501';
  end if;

  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if v_case.status <> 'approved' then
    raise exception 'Only an approved refund can be restocked.'
      using errcode = '23514';
  end if;

  if v_case.return_path <> 'physical_return' then
    raise exception 'This refund was approved without a physical return.'
      using errcode = '23514';
  end if;

  if v_case.received_at is null then
    raise exception 'Confirm the returned item was received before restocking it.'
      using errcode = '23514';
  end if;

  if v_case.restocked_at is not null then
    raise exception 'This return was already restocked.' using errcode = '23514';
  end if;

  for v_item in
    select oi.product_id, oi.quantity
      from public.order_items oi
     where oi.order_vendor_id = v_case.order_vendor_id
     order by oi.product_id
  loop
    perform public.adjust_product_stock(
      v_item.product_id,
      v_item.quantity,
      'Refund case ' || p_case_id::text
        || ' — returned item restocked after inspection'
    );
  end loop;

  update public.refund_cases
     set restocked_at = now(),
         restocked_by = auth.uid()
   where id = p_case_id;
end;
$$;

revoke all on function public.restock_refund_case(uuid) from public, anon;
grant execute on function public.restock_refund_case(uuid) to authenticated;
