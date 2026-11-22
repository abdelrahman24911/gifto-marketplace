-- Gifto Marketplace - Phase 28: order status audit and controlled transitions
--
-- Every suborder status change is recorded with its actor, previous status,
-- new status, reason and note. Direct status updates by signed-in users are
-- revoked; all vendor and admin transitions go through one locked RPC that
-- rejects stale pages and requires a reason for failed deliveries and admin
-- cancellations/returns. Customer cancellation is still handled by
-- cancel_order() and is captured by the same audit trigger.

-- ---------------------------------------------------------------------------
-- Append-only status history
-- ---------------------------------------------------------------------------

create table public.order_status_events (
  id               bigint generated always as identity primary key,
  order_vendor_id  uuid not null references public.order_vendors (id) on delete cascade,
  order_id         uuid not null references public.orders (id) on delete cascade,
  vendor_id        uuid not null references public.vendors (id) on delete restrict,
  from_status      public.order_status not null,
  to_status        public.order_status not null,
  actor_id         uuid references public.profiles (id) on delete set null,
  actor_role       text not null
                   check (actor_role in ('customer', 'vendor', 'admin', 'system')),
  reason_code      text
                   check (
                     reason_code is null
                     or reason_code in (
                       'customer_refused',
                       'unreachable',
                       'wrong_address',
                       'customer_request',
                       'out_of_stock',
                       'damaged',
                       'duplicate',
                       'fraud',
                       'admin_override',
                       'other'
                     )
                   ),
  note             text check (note is null or length(note) <= 1000),
  created_at       timestamptz not null default now()
);

alter table public.order_status_events enable row level security;

create index order_status_events_order_vendor_idx
  on public.order_status_events (order_vendor_id, created_at desc);
create index order_status_events_order_idx
  on public.order_status_events (order_id, created_at desc);
create index order_status_events_vendor_failed_idx
  on public.order_status_events (vendor_id, created_at desc)
  where from_status = 'shipped' and to_status = 'cancelled';

create policy "order_status_events: customer read"
  on public.order_status_events for select
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.user_id = auth.uid()
    )
  );

create policy "order_status_events: vendor read"
  on public.order_status_events for select
  using (public.is_vendor_member(vendor_id));

create policy "order_status_events: platform admin read"
  on public.order_status_events for select
  using (public.is_platform_admin());

revoke all on table public.order_status_events from public, anon, authenticated;
grant select on table public.order_status_events to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Event capture
-- ---------------------------------------------------------------------------

create or replace function public.record_order_status_event()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_reason text;
  v_note text;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if v_actor is null then
    v_role := 'system';
  elsif public.is_platform_admin() then
    v_role := 'admin';
  elsif public.is_vendor_manager(new.vendor_id) then
    v_role := 'vendor';
  else
    v_role := 'customer';
  end if;

  v_reason := nullif(btrim(current_setting('gifto.order_status_reason', true)), '');
  v_note := nullif(btrim(current_setting('gifto.order_status_note', true)), '');

  insert into public.order_status_events (
    order_vendor_id,
    order_id,
    vendor_id,
    from_status,
    to_status,
    actor_id,
    actor_role,
    reason_code,
    note
  )
  values (
    new.id,
    new.order_id,
    new.vendor_id,
    old.status,
    new.status,
    v_actor,
    v_role,
    v_reason,
    v_note
  );

  return null;
end;
$$;

revoke all on function public.record_order_status_event()
  from public, anon, authenticated;

create trigger order_vendors_record_status_event
  after update of status on public.order_vendors
  for each row execute function public.record_order_status_event();

-- Existing orders can reconstruct every transition from their timestamp
-- columns. Actors are deliberately marked as system because the original actor
-- was never stored.
insert into public.order_status_events (
  order_vendor_id,
  order_id,
  vendor_id,
  from_status,
  to_status,
  actor_id,
  actor_role,
  reason_code,
  note,
  created_at
)
select
  ov.id,
  ov.order_id,
  ov.vendor_id,
  'placed'::public.order_status,
  'confirmed'::public.order_status,
  null::uuid,
  'system',
  null,
  'Backfilled from the suborder confirmation timestamp.',
  ov.confirmed_at
from public.order_vendors ov
where ov.confirmed_at is not null
union all
select
  ov.id,
  ov.order_id,
  ov.vendor_id,
  'confirmed'::public.order_status,
  'shipped'::public.order_status,
  null::uuid,
  'system',
  null,
  'Backfilled from the suborder shipment timestamp.',
  ov.shipped_at
from public.order_vendors ov
where ov.shipped_at is not null
union all
select
  ov.id,
  ov.order_id,
  ov.vendor_id,
  'shipped'::public.order_status,
  'delivered'::public.order_status,
  null::uuid,
  'system',
  null,
  'Backfilled from the suborder delivery timestamp.',
  ov.delivered_at
from public.order_vendors ov
where ov.delivered_at is not null
union all
select
  ov.id,
  ov.order_id,
  ov.vendor_id,
  case
    when ov.shipped_at is not null then 'shipped'::public.order_status
    when ov.confirmed_at is not null then 'confirmed'::public.order_status
    else 'placed'::public.order_status
  end,
  'cancelled'::public.order_status,
  null::uuid,
  'system',
  null,
  'Backfilled from the suborder cancellation timestamp.',
  ov.cancelled_at
from public.order_vendors ov
where ov.cancelled_at is not null
union all
select
  ov.id,
  ov.order_id,
  ov.vendor_id,
  'delivered'::public.order_status,
  'returned'::public.order_status,
  null::uuid,
  'system',
  null,
  'Backfilled from the suborder return timestamp.',
  ov.updated_at
from public.order_vendors ov
where ov.status = 'returned';

-- ---------------------------------------------------------------------------
-- Single controlled transition path
-- ---------------------------------------------------------------------------

create or replace function public.set_order_vendor_status(
  p_order_vendor_id uuid,
  p_next_status public.order_status,
  p_expected_status public.order_status,
  p_reason_code text default null,
  p_note text default null
)
returns table (
  order_id uuid,
  vendor_id uuid,
  previous_status public.order_status,
  status public.order_status
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.order_vendors%rowtype;
  v_is_admin boolean;
  v_is_vendor boolean;
  v_reason text := nullif(lower(btrim(p_reason_code)), '');
  v_note text := nullif(btrim(p_note), '');
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select *
    into v_row
    from public.order_vendors
   where id = p_order_vendor_id
     for update;

  if not found then
    raise exception 'Order line not found.' using errcode = '42501';
  end if;

  v_is_admin := public.is_platform_admin();
  v_is_vendor := public.is_vendor_manager(v_row.vendor_id);

  if not (v_is_admin or v_is_vendor) then
    raise exception 'Only shop owners, managers, or platform administrators can update orders.'
      using errcode = '42501';
  end if;

  if v_row.status <> p_expected_status then
    raise exception 'This order line changed since the page was loaded. Refresh and try again.'
      using errcode = '40001';
  end if;

  if v_row.status = p_next_status then
    raise exception 'This order line is already marked "%".', p_next_status
      using errcode = '23514';
  end if;

  if v_note is not null and length(v_note) > 1000 then
    raise exception 'The note must be 1000 characters or fewer.'
      using errcode = '22001';
  end if;

  if v_reason is not null and v_reason not in (
    'customer_refused',
    'unreachable',
    'wrong_address',
    'customer_request',
    'out_of_stock',
    'damaged',
    'duplicate',
    'fraud',
    'admin_override',
    'other'
  ) then
    raise exception 'Unknown status reason.' using errcode = '22023';
  end if;

  if v_row.status = 'shipped' and p_next_status = 'cancelled' and v_reason is null then
    raise exception 'A failed delivery needs a reason.'
      using errcode = '23514';
  end if;

  if v_is_admin and p_next_status in ('cancelled', 'returned') and v_reason is null then
    raise exception 'Administrative cancellations and returns need a reason.'
      using errcode = '23514';
  end if;

  if v_reason = 'other' and v_note is null then
    raise exception 'Add a note when the reason is "other".'
      using errcode = '23514';
  end if;

  perform set_config('gifto.order_status_reason', coalesce(v_reason, ''), true);
  perform set_config('gifto.order_status_note', coalesce(v_note, ''), true);

  update public.order_vendors
     set status = p_next_status
   where id = v_row.id;

  perform set_config('gifto.order_status_reason', '', true);
  perform set_config('gifto.order_status_note', '', true);

  return query
    select v_row.order_id, v_row.vendor_id, v_row.status, p_next_status;
end;
$$;

revoke all on function public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text
) from public, anon;
grant execute on function public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text
) to authenticated;

-- Status changes now have exactly one API path. The RLS policy remains as a
-- second boundary if grants are ever widened by mistake.
revoke update (status, updated_at) on table public.order_vendors
  from authenticated;

-- ---------------------------------------------------------------------------
-- Delivered-at reporting indexes
-- ---------------------------------------------------------------------------

create index order_vendors_vendor_delivered_idx
  on public.order_vendors (vendor_id, delivered_at desc)
  include (subtotal_minor)
  where status = 'delivered' and delivered_at is not null;

create index order_vendors_delivered_idx
  on public.order_vendors (delivered_at desc)
  include (vendor_id, subtotal_minor)
  where status = 'delivered' and delivered_at is not null;

create index order_vendors_created_idx
  on public.order_vendors (created_at desc, id desc)
  include (vendor_id, status, subtotal_minor);

comment on table public.order_status_events is
  'Append-only history of every suborder status transition and its actor.';
comment on function public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text
) is
  'Authorized, stale-safe suborder transition with audit reason and note.';
