-- Gifto Marketplace — Phase 4: orders and checkout
--
-- Business decisions encoded here (settled with the platform owner, not
-- invented by the implementation):
--   * Payment: cash on delivery only. No gateway, no card fields.
--   * Fulfillment: every vendor delivers their own suborder.
--   * Cart: one customer checkout may span many shops, split into per-vendor
--     suborders (`order_vendors`) that are fulfilled independently.
--   * Commission: per-vendor rate, no platform-wide default; the rate is
--     snapshotted onto the suborder at placement so later rate changes never
--     rewrite past orders. It becomes *earned* on delivery confirmation (the
--     amount is computed by the money phase, not here).
--
-- Money is always integer piastres with an explicit 'EGP' currency.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Shared vocabulary for both the parent order and each vendor suborder.
create type public.order_status as enum (
  'placed', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'
);

-- ---------------------------------------------------------------------------
-- orders — one customer checkout
-- ---------------------------------------------------------------------------

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  -- Nullable so an account deletion does not destroy financial history, and so
  -- guest checkout can be added later without a schema change. Checkout still
  -- requires a signed-in session today (enforced inside `place_order`).
  user_id           uuid references public.profiles (id) on delete set null,
  status            public.order_status not null default 'placed',
  payment_method    text not null default 'cod' check (payment_method = 'cod'),
  currency          text not null default 'EGP' check (currency = 'EGP'),
  subtotal_minor    int not null check (subtotal_minor >= 0),
  delivery_fee_minor int not null default 0 check (delivery_fee_minor >= 0),
  total_minor       int not null check (total_minor >= 0),
  recipient_name    text not null check (length(trim(recipient_name)) between 2 and 120),
  contact_phone     text not null check (length(trim(contact_phone)) between 5 and 30),
  address_line      text not null check (length(trim(address_line)) between 5 and 300),
  city              text not null check (length(trim(city)) between 2 and 80),
  governorate       text not null check (length(trim(governorate)) between 2 and 80),
  notes             text check (notes is null or length(notes) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint orders_total_matches check (total_minor = subtotal_minor + delivery_fee_minor)
);

alter table public.orders enable row level security;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status);

-- ---------------------------------------------------------------------------
-- order_vendors — one vendor's slice of an order
-- ---------------------------------------------------------------------------

create table public.order_vendors (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  vendor_id         uuid not null references public.vendors (id) on delete restrict,
  status            public.order_status not null default 'placed',
  currency          text not null default 'EGP' check (currency = 'EGP'),
  subtotal_minor    int not null check (subtotal_minor >= 0),
  delivery_fee_minor int not null default 0 check (delivery_fee_minor >= 0),
  -- Snapshot of `vendors.commission_rate` at placement time. Per-vendor, no
  -- platform default; frozen so a later rate change cannot alter this order.
  commission_rate   numeric(5,4) not null check (commission_rate >= 0 and commission_rate <= 1),
  confirmed_at      timestamptz,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (order_id, vendor_id)
);

alter table public.order_vendors enable row level security;

create trigger order_vendors_set_updated_at
  before update on public.order_vendors
  for each row execute function public.set_updated_at();

create index order_vendors_order_idx on public.order_vendors (order_id);
create index order_vendors_vendor_idx on public.order_vendors (vendor_id, status);

-- ---------------------------------------------------------------------------
-- order_items — immutable line snapshots owned by a suborder
-- ---------------------------------------------------------------------------

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_vendor_id   uuid not null references public.order_vendors (id) on delete cascade,
  product_id        uuid references public.products (id) on delete set null,
  product_name      text not null,
  product_slug      text not null,
  unit_price_minor  int not null check (unit_price_minor >= 0),
  quantity          int not null check (quantity between 1 and 20),
  line_total_minor  int not null check (line_total_minor >= 0),
  currency          text not null default 'EGP' check (currency = 'EGP'),
  created_at        timestamptz not null default now(),
  constraint order_items_total_matches check (line_total_minor = unit_price_minor * quantity)
);

alter table public.order_items enable row level security;

create index order_items_suborder_idx on public.order_items (order_vendor_id);

-- ---------------------------------------------------------------------------
-- inventory_movements — audit trail behind every stock change
-- ---------------------------------------------------------------------------

create table public.inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  delta       int not null,
  reason      text not null check (reason in ('order_placed', 'order_cancelled', 'manual_adjustment')),
  order_id    uuid references public.orders (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.inventory_movements enable row level security;

create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Suborder status transitions + timestamps
-- ---------------------------------------------------------------------------

create or replace function public.assert_order_vendor_transition()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_ok :=
       (old.status = 'placed'    and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('shipped', 'cancelled'))
    or (old.status = 'shipped'   and new.status = 'delivered')
    or (old.status = 'delivered' and new.status = 'returned' and public.is_platform_admin());

  if not v_ok then
    raise exception 'A % order cannot move from “%” to “%”.',
      'vendor suborder', old.status, new.status
      using errcode = '23514';
  end if;

  if new.status = 'confirmed' and old.status = 'placed' then
    new.confirmed_at := now();
  elsif new.status = 'shipped' and old.status = 'confirmed' then
    new.shipped_at := now();
  elsif new.status = 'delivered' and old.status = 'shipped' then
    new.delivered_at := now();
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.assert_order_vendor_transition() from public, anon, authenticated;

create trigger order_vendors_assert_transition
  before update of status on public.order_vendors
  for each row execute function public.assert_order_vendor_transition();

-- ---------------------------------------------------------------------------
-- Restock when a suborder is cancelled
-- ---------------------------------------------------------------------------

create or replace function public.restock_cancelled_suborder()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_item record;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return null;
  end if;

  for v_item in
    select product_id, quantity
      from public.order_items
     where order_vendor_id = new.id
       and product_id is not null
  loop
    update public.products
       set stock = stock + v_item.quantity
     where id = v_item.product_id;

    insert into public.inventory_movements (product_id, delta, reason, order_id, created_by)
    values (v_item.product_id, v_item.quantity, 'order_cancelled', new.order_id, auth.uid());
  end loop;

  return null;
end;
$$;

revoke all on function public.restock_cancelled_suborder() from public, anon, authenticated;

create trigger order_vendors_restock_on_cancel
  after update of status on public.order_vendors
  for each row execute function public.restock_cancelled_suborder();

-- ---------------------------------------------------------------------------
-- Keep the parent order status in step with its suborders
-- ---------------------------------------------------------------------------

create or replace function public.sync_parent_order_status()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_total       int;
  v_delivered   int;
  v_cancelled   int;
  v_returned    int;
  v_in_progress int;
  v_current     public.order_status;
  v_next        public.order_status;
begin
  select count(*),
         count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'cancelled'),
         count(*) filter (where status = 'returned'),
         count(*) filter (where status in ('confirmed', 'shipped'))
    into v_total, v_delivered, v_cancelled, v_returned, v_in_progress
    from public.order_vendors
   where order_id = new.order_id;

  select status into v_current from public.orders where id = new.order_id for update;
  if v_current is null then
    return null;
  end if;

  if v_total = v_delivered then
    v_next := 'delivered';
  elsif v_total = v_cancelled then
    v_next := 'cancelled';
  elsif v_total = v_returned then
    v_next := 'returned';
  elsif v_in_progress > 0 and v_current = 'placed' then
    v_next := 'confirmed';
  else
    return null;
  end if;

  update public.orders
     set status = v_next
   where id = new.order_id
     and status is distinct from v_next;

  return null;
end;
$$;

revoke all on function public.sync_parent_order_status() from public, anon, authenticated;

create trigger order_vendors_sync_parent
  after update of status on public.order_vendors
  for each row execute function public.sync_parent_order_status();

-- ---------------------------------------------------------------------------
-- place_order — atomic checkout
--
-- Reads every price, stock level and commission rate from the database under a
-- row lock. Nothing about money comes from the client.
-- ---------------------------------------------------------------------------

create or replace function public.place_order(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_line       record;
  v_json       jsonb;
  v_pids       uuid[] := array[]::uuid[];
  v_qtys       int[] := array[]::int[];
  v_distinct   int;
  v_product    record;
  v_idx        int;
  v_qty        int;
  v_ok_pids    uuid[] := array[]::uuid[];
  v_ok_vendors uuid[] := array[]::uuid[];
  v_ok_prices  int[] := array[]::int[];
  v_ok_names   text[] := array[]::text[];
  v_ok_slugs   text[] := array[]::text[];
  v_ok_qtys    int[] := array[]::int[];
  v_subtotal   int;
  v_order_id   uuid;
  v_vendor_id  uuid;
  v_rate       numeric(5,4);
  v_ov_id      uuid;
  v_ov_sub     int;
  i            int;
begin
  -- ------------------------------------------------------------------ auth
  if v_uid is null then
    raise exception 'You must be signed in to place an order.'
      using errcode = '42501';
  end if;

  -- ---------------------------------------------------------- address checks
  if p_recipient_name is null or length(trim(p_recipient_name)) not between 2 and 120 then
    raise exception 'Enter the recipient name (2–120 characters).' using errcode = '22023';
  end if;
  if p_contact_phone is null or length(trim(p_contact_phone)) not between 5 and 30 then
    raise exception 'Enter a contact phone number (5–30 characters).' using errcode = '22023';
  end if;
  if p_address_line is null or length(trim(p_address_line)) not between 5 and 300 then
    raise exception 'Enter the delivery address (5–300 characters).' using errcode = '22023';
  end if;
  if p_city is null or length(trim(p_city)) not between 2 and 80 then
    raise exception 'Enter the city (2–80 characters).' using errcode = '22023';
  end if;
  if p_governorate is null or length(trim(p_governorate)) not between 2 and 80 then
    raise exception 'Enter the governorate (2–80 characters).' using errcode = '22023';
  end if;
  if p_notes is not null and length(p_notes) > 1000 then
    raise exception 'Delivery notes must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  -- ------------------------------------------------------------ cart checks
  -- Split across two statements: `jsonb_array_length` raises on a non-array,
  -- and SQL `OR` gives no ordering guarantee.
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'An order can contain at most 50 different products.' using errcode = '22023';
  end if;

  for v_line in select e.value as v from jsonb_array_elements(p_items) as e(value) loop
    v_json := v_line.v;

    if coalesce(v_json ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Your cart contains an invalid product.' using errcode = '22023';
    end if;

    begin
      v_qty := (v_json ->> 'quantity')::int;
    exception when others then
      raise exception 'Your cart contains an invalid quantity.' using errcode = '22023';
    end;

    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Quantity must be between 1 and 20.' using errcode = '22023';
    end if;

    v_pids := array_append(v_pids, (v_json ->> 'product_id')::uuid);
    v_qtys := array_append(v_qtys, v_qty);
  end loop;

  -- The cart UI merges duplicates; rejecting them here keeps the lock loop
  -- below free of "sum the quantities per product" bookkeeping.
  select count(*) into v_distinct from (select unnest(v_pids) as pid group by pid) t;
  if v_distinct <> array_length(v_pids, 1) then
    raise exception 'Each product can appear only once in the cart.' using errcode = '22023';
  end if;

  -- ------------------------------------------------- lock, price and validate
  for v_product in
    select p.id, p.vendor_id, p.price_minor, p.stock, p.name, p.slug, p.status
      from public.products p
     where p.id = any (v_pids)
     order by p.id
       for update
  loop
    v_idx := array_position(v_pids, v_product.id);
    v_qty := v_qtys[v_idx];

    if v_product.status <> 'active' or not public.is_public_vendor(v_product.vendor_id) then
      raise exception '“%” is no longer available.', v_product.name using errcode = '22023';
    end if;

    if v_product.stock < v_qty then
      raise exception 'Only % of “%” are in stock.', v_product.stock, v_product.name
        using errcode = '22023';
    end if;

    v_ok_pids    := array_append(v_ok_pids, v_product.id);
    v_ok_vendors := array_append(v_ok_vendors, v_product.vendor_id);
    v_ok_prices  := array_append(v_ok_prices, v_product.price_minor);
    v_ok_names   := array_append(v_ok_names, v_product.name);
    v_ok_slugs   := array_append(v_ok_slugs, v_product.slug);
    v_ok_qtys    := array_append(v_ok_qtys, v_qty);
  end loop;

  if array_length(v_ok_pids, 1) is distinct from array_length(v_pids, 1) then
    raise exception 'One or more products are no longer available.' using errcode = '22023';
  end if;

  select coalesce(sum(t.price * t.qty), 0)
    into v_subtotal
    from unnest(v_ok_prices, v_ok_qtys) as t(price, qty);

  -- ---------------------------------------------------------- write the order
  insert into public.orders (
    user_id, status, payment_method, subtotal_minor, delivery_fee_minor, total_minor,
    recipient_name, contact_phone, address_line, city, governorate, notes
  ) values (
    v_uid, 'placed', 'cod', v_subtotal, 0, v_subtotal,
    trim(p_recipient_name), trim(p_contact_phone), trim(p_address_line),
    trim(p_city), trim(p_governorate), nullif(trim(p_notes), '')
  )
  returning id into v_order_id;

  -- ------------------------------------------- split into per-vendor suborders
  for v_vendor_id in select distinct vid from unnest(v_ok_vendors) as u(vid) loop
    select coalesce(sum(v_ok_prices[n] * v_ok_qtys[n]), 0)
      into v_ov_sub
      from generate_subscripts(v_ok_pids, 1) as g(n)
     where v_ok_vendors[n] = v_vendor_id;

    -- Per-vendor rate snapshot; there is no platform-wide default.
    select commission_rate into v_rate from public.vendors where id = v_vendor_id;
    if v_rate is null then
      v_rate := 0;
    end if;

    insert into public.order_vendors (
      order_id, vendor_id, status, subtotal_minor, delivery_fee_minor, commission_rate
    ) values (
      v_order_id, v_vendor_id, 'placed', v_ov_sub, 0, v_rate
    )
    returning id into v_ov_id;

    for i in select n from generate_subscripts(v_ok_pids, 1) as g(n)
             where v_ok_vendors[n] = v_vendor_id
    loop
      insert into public.order_items (
        order_vendor_id, product_id, product_name, product_slug,
        unit_price_minor, quantity, line_total_minor
      ) values (
        v_ov_id, v_ok_pids[i], v_ok_names[i], v_ok_slugs[i],
        v_ok_prices[i], v_ok_qtys[i], v_ok_prices[i] * v_ok_qtys[i]
      );

      update public.products
         set stock = stock - v_ok_qtys[i]
       where id = v_ok_pids[i];

      insert into public.inventory_movements (product_id, delta, reason, order_id, created_by)
      values (v_ok_pids[i], -v_ok_qtys[i], 'order_placed', v_order_id, v_uid);
    end loop;
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.place_order(jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_order — customer-initiated, only before any shop has acted
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_status public.order_status;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select user_id, status
    into v_owner, v_status
    from public.orders
   where id = p_order_id
     for update;

  if v_owner is null or (v_owner <> v_uid and not public.is_platform_admin()) then
    raise exception 'Order not found.' using errcode = '42501';
  end if;

  if v_status <> 'placed' then
    raise exception 'Only orders that no shop has started processing can be cancelled.'
      using errcode = '23514';
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;

  -- Each suborder cancellation restores its stock via the restock trigger.
  update public.order_vendors
     set status = 'cancelled'
   where order_id = p_order_id
     and status <> 'cancelled';
end;
$$;

revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so it reads `order_vendors` without re-triggering that
-- table's policies (which point back at `orders`) — a plain subquery here would
-- recurse infinitely. Same pattern as `is_vendor_member`.
create or replace function public.is_order_shop_member(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.order_vendors ov
    where ov.order_id = p_order_id and public.is_vendor_member(ov.vendor_id)
  );
$$;

revoke all on function public.is_order_shop_member(uuid) from public, anon;
grant execute on function public.is_order_shop_member(uuid) to authenticated;

create policy "orders: owner read"
  on public.orders for select
  using (user_id = auth.uid());

create policy "orders: platform admin read"
  on public.orders for select
  using (public.is_platform_admin());

create policy "order_vendors: customer read"
  on public.order_vendors for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()
  ));

create policy "order_vendors: vendor read"
  on public.order_vendors for select
  using (public.is_vendor_member(vendor_id));

create policy "order_vendors: platform admin read"
  on public.order_vendors for select
  using (public.is_platform_admin());

-- A shop has to see where its own suborders go, so member vendors may read the
-- parent order's delivery details — but only for orders that contain one of
-- their suborders. Unrelated orders stay invisible.
create policy "orders: vendor read"
  on public.orders for select
  using (public.is_order_shop_member(id));

create policy "order_vendors: vendor status update"
  on public.order_vendors for update
  using (public.is_vendor_manager(vendor_id) or public.is_platform_admin())
  with check (public.is_vendor_manager(vendor_id) or public.is_platform_admin());

create policy "order_items: customer read"
  on public.order_items for select
  using (exists (
    select 1
      from public.order_vendors ov
      join public.orders o on o.id = ov.order_id
     where ov.id = order_vendor_id and o.user_id = auth.uid()
  ));

create policy "order_items: vendor read"
  on public.order_items for select
  using (exists (
    select 1
      from public.order_vendors ov
     where ov.id = order_vendor_id and public.is_vendor_member(ov.vendor_id)
  ));

create policy "order_items: platform admin read"
  on public.order_items for select
  using (public.is_platform_admin());

create policy "inventory_movements: vendor read"
  on public.inventory_movements for select
  using (exists (
    select 1 from public.products p
    where p.id = product_id and public.is_vendor_member(p.vendor_id)
  ));

create policy "inventory_movements: platform admin read"
  on public.inventory_movements for select
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Least-privilege grants
--
-- Orders are written only by the SECURITY DEFINER checkout functions, so
-- customers get read access plus (suborders only) a narrow status update.
-- There is deliberately no INSERT/DELETE grant anywhere in this group.
-- ---------------------------------------------------------------------------

grant select on table public.orders, public.order_items, public.inventory_movements
  to authenticated;

grant select, update (status, updated_at) on table public.order_vendors
  to authenticated;
