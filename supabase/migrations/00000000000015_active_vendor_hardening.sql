-- Phase 2A.1 security hardening.
--
-- 1. Operational authorization is active-only. Inactive vendors keep read access
--    to their own account/membership/status for the dashboard, but cannot read
--    customer PII, manage rosters, edit the vendor profile, delete catalog data,
--    or read commission/settlement records.
-- 2. Product stock is never writable through the generic product UPDATE grant;
--    stock changes must go through adjust_product_stock(), which records an
--    inventory movement.
-- 3. Contact emails are unique after normalization.
-- 4. Vendor + owner membership creation is a single service-role-only RPC so the
--    admin invitation flow cannot leave a shop without an owner.

-- ---------------------------------------------------------------------------
-- Active-only membership helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_vendor_active_member(p_vendor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendor_members vm
    join public.vendors v on v.id = vm.vendor_id
    where vm.vendor_id = p_vendor_id
      and vm.profile_id = auth.uid()
      and v.status = 'active'
  );
$$;

create or replace function public.is_vendor_active_owner(p_vendor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendor_members vm
    join public.vendors v on v.id = vm.vendor_id
    where vm.vendor_id = p_vendor_id
      and vm.profile_id = auth.uid()
      and vm.role = 'owner'
      and v.status = 'active'
  );
$$;

revoke all on function
  public.is_vendor_active_member(uuid),
  public.is_vendor_active_owner(uuid)
from public;

grant execute on function
  public.is_vendor_active_member(uuid),
  public.is_vendor_active_owner(uuid)
to authenticated;

-- Used by the "orders: vendor read" policy. Replacing it here makes parent-order
-- PII visibility active-only as well.
create or replace function public.is_order_shop_member(p_order_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_vendors ov
    where ov.order_id = p_order_id
      and public.is_vendor_active_member(ov.vendor_id)
  );
$$;

revoke all on function public.is_order_shop_member(uuid) from public, anon;
grant execute on function public.is_order_shop_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vendor profile and roster policies
-- ---------------------------------------------------------------------------

drop policy if exists "vendors: owner update own" on public.vendors;
create policy "vendors: owner update own"
  on public.vendors for update
  using (public.is_vendor_active_owner(id))
  with check (public.is_vendor_active_owner(id));

drop policy if exists "vendor_members: owner manage" on public.vendor_members;
create policy "vendor_members: owner manage"
  on public.vendor_members for insert
  with check (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  );

drop policy if exists "vendor_members: owner update" on public.vendor_members;
create policy "vendor_members: owner update"
  on public.vendor_members for update
  using (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  )
  with check (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  );

drop policy if exists "vendor_members: owner delete" on public.vendor_members;
create policy "vendor_members: owner delete"
  on public.vendor_members for delete
  using (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Catalog policies and stock write restriction
-- ---------------------------------------------------------------------------

drop policy if exists "products: owner delete" on public.products;
create policy "products: owner delete"
  on public.products for delete
  using (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  );

drop policy if exists "product_images: owner delete" on public.product_images;
create policy "product_images: owner delete"
  on public.product_images for delete
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.is_vendor_active_owner(p.vendor_id)
             or public.is_platform_admin())
    )
  );

-- Keep INSERT broad so initial stock can be supplied at product creation. Only
-- UPDATE is column-restricted; stock changes must use the audited RPC.
revoke update on table public.products from authenticated;
grant update (name, description, price_minor, category_id, status, updated_at)
  on table public.products
  to authenticated;

-- ---------------------------------------------------------------------------
-- Order / PII / commission read policies
-- ---------------------------------------------------------------------------

drop policy if exists "order_vendors: vendor read" on public.order_vendors;
create policy "order_vendors: vendor read"
  on public.order_vendors for select
  using (public.is_vendor_active_member(vendor_id));

drop policy if exists "order_items: vendor read" on public.order_items;
create policy "order_items: vendor read"
  on public.order_items for select
  using (
    exists (
      select 1
      from public.order_vendors ov
      where ov.id = order_vendor_id
        and public.is_vendor_active_member(ov.vendor_id)
    )
  );

drop policy if exists "inventory_movements: vendor read" on public.inventory_movements;
create policy "inventory_movements: vendor read"
  on public.inventory_movements for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and public.is_vendor_active_member(p.vendor_id)
    )
  );

drop policy if exists "commission_entries: vendor read" on public.commission_entries;
create policy "commission_entries: vendor read"
  on public.commission_entries for select
  using (public.is_vendor_active_member(vendor_id));

drop policy if exists "settlements: vendor read" on public.settlements;
create policy "settlements: vendor read"
  on public.settlements for select
  using (public.is_vendor_active_member(vendor_id));

drop policy if exists "settlement_lines: vendor read" on public.settlement_lines;
create policy "settlement_lines: vendor read"
  on public.settlement_lines for select
  using (
    exists (
      select 1 from public.settlements s
      where s.id = settlement_id
        and public.is_vendor_active_member(s.vendor_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Normalized contact-email uniqueness
-- ---------------------------------------------------------------------------

do $$
declare
  v_duplicates text;
begin
  select string_agg(email || ' (' || count::text || ')', ', ' order by email)
    into v_duplicates
  from (
    select lower(btrim(contact_email)) as email, count(*)
    from public.vendors
    where contact_email is not null
      and btrim(contact_email) <> ''
    group by lower(btrim(contact_email))
    having count(*) > 1
  ) duplicates;

  if v_duplicates is not null then
    raise exception
      'Cannot add normalized contact-email uniqueness. Resolve duplicate vendor emails first: %',
      v_duplicates
      using errcode = '23505';
  end if;
end $$;

create unique index if not exists vendors_contact_email_normalized_key
  on public.vendors (lower(btrim(contact_email)))
  where contact_email is not null and btrim(contact_email) <> '';

-- ---------------------------------------------------------------------------
-- Atomic service-role-only vendor creation
-- ---------------------------------------------------------------------------

create or replace function public.create_vendor_for_owner(
  p_name text,
  p_description text,
  p_city text,
  p_governorate text,
  p_contact_phone text,
  p_contact_email text,
  p_commission_rate numeric,
  p_profile_id uuid
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_contact_email, '')));
  v_base text;
  v_slug text;
  v_vendor_id uuid;
  v_try int := 0;
begin
  if p_profile_id is null then
    raise exception 'An owner profile is required.' using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Vendor name must be between 2 and 80 characters.'
      using errcode = '22023';
  end if;
  if v_email = '' or length(v_email) > 160 then
    raise exception 'A valid vendor contact email is required.'
      using errcode = '22023';
  end if;
  if p_commission_rate is null
     or p_commission_rate < 0
     or p_commission_rate > 1 then
    raise exception 'Commission rate must be between 0 and 1.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.vendors v
    where lower(btrim(v.contact_email)) = v_email
  ) then
    raise exception 'A shop with this contact email already exists.'
      using errcode = '23505';
  end if;

  -- The auth user normally already has a profile (trigger). Insert defensively
  -- for service-role-created users, but never overwrite an existing profile.
  insert into public.profiles (id, email, full_name, phone)
  values (
    p_profile_id,
    v_email,
    v_name,
    nullif(btrim(coalesce(p_contact_phone, '')), '')
  )
  on conflict (id) do nothing;

  v_base := public.slugify(v_name);
  if v_base = '' then
    raise exception 'Vendor name must contain at least one letter or number.'
      using errcode = '22023';
  end if;

  loop
    v_slug := case when v_try = 0 then v_base else v_base || '-' || v_try::text end;
    exit when not exists (select 1 from public.vendors v where v.slug = v_slug);
    v_try := v_try + 1;
    if v_try > 100 then
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
  end loop;

  insert into public.vendors (
    name, slug, description, city, governorate, contact_phone, contact_email,
    status, commission_rate
  )
  values (
    v_name,
    v_slug,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_governorate, '')), ''),
    nullif(btrim(coalesce(p_contact_phone, '')), ''),
    v_email,
    'pending',
    p_commission_rate
  )
  returning id into v_vendor_id;

  insert into public.vendor_members (vendor_id, profile_id, role)
  values (v_vendor_id, p_profile_id, 'owner');

  return v_vendor_id;
end;
$$;

revoke all on function
  public.create_vendor_for_owner(
    text, text, text, text, text, text, numeric, uuid
  )
from public, anon, authenticated;

grant execute on function
  public.create_vendor_for_owner(
    text, text, text, text, text, text, numeric, uuid
  )
to service_role;
