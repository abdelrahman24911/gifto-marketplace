-- Gifto Marketplace — Phase 3: catalog (categories, products, product images)
--
-- Multi-vendor catalog. Every product is owned by exactly one vendor and is
-- governed by RLS so that:
--   * the public sees only ACTIVE products of ACTIVE vendors,
--   * vendors manage only their own products (manager/owner for writes),
--   * platform admins can moderate any product.
--
-- Money policy: prices are stored in integer minor units (piastres) with an
-- explicit currency column, per the architecture brief's guidance to use
-- integer minor units and record currency explicitly. EGP has 2 decimal places.

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------

create type public.product_status as enum ('draft', 'active', 'archived');

-- ---------------------------------------------------------------------------
-- categories — platform-managed taxonomy (public read of active only)
-- ---------------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) >= 2),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  position    int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.categories enable row level security;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create index categories_active_idx on public.categories (is_active, position);

-- ---------------------------------------------------------------------------
-- products — a vendor's sellable item
-- ---------------------------------------------------------------------------

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  name        text not null check (length(trim(name)) >= 2),
  slug        text not null,
  description text,
  price_minor int not null check (price_minor >= 0),
  currency    text not null default 'EGP' check (currency = 'EGP'),
  stock       int not null default 0 check (stock >= 0),
  status      public.product_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (vendor_id, slug)
);

alter table public.products enable row level security;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create index products_vendor_idx on public.products (vendor_id);
create index products_category_idx on public.products (category_id);
create index products_status_idx on public.products (status);
-- Covers the storefront query shape: active products for a category.
create index products_public_idx on public.products (category_id, vendor_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- product_images — Storage paths only (never binary blobs)
-- ---------------------------------------------------------------------------

create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  path       text not null,
  alt        text,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, path)
);

alter table public.product_images enable row level security;

create index product_images_product_idx on public.product_images (product_id, position);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the given vendor is publicly visible (active). SECURITY DEFINER so
-- catalog policies do not need direct (and revoked) anon access to `vendors`.
create or replace function public.is_public_vendor(p_vendor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id
      and v.status = 'active'
  );
$$;

revoke all on function public.is_public_vendor(uuid) from public;
grant execute on function public.is_public_vendor(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Slug derivation (server-owned, unique per vendor, fixed at creation)
-- ---------------------------------------------------------------------------

create or replace function public.set_product_slug()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_try  int := 1;
begin
  -- Allow an explicit slug, but normalise it. Empty/null falls back to name.
  if new.slug is not null and length(trim(new.slug)) > 0 then
    new.slug := public.slugify(new.slug);
    if new.slug = '' then new.slug := null; end if;
  end if;

  if new.slug is null then
    v_base := public.slugify(new.name);
    if v_base = '' then
      raise exception 'Product name must contain at least one letter or number.'
        using errcode = '22023';
    end if;

    v_slug := v_base;
    while exists (
      select 1 from public.products p
      where p.vendor_id = new.vendor_id and p.slug = v_slug
    ) loop
      v_try := v_try + 1;
      if v_try > 100 then
        v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
        exit;
      end if;
      v_slug := v_base || '-' || v_try::text;
    end loop;

    new.slug := v_slug;
  end if;

  return new;
end;
$$;

revoke all on function public.set_product_slug() from public, anon, authenticated;

create trigger products_set_slug
  before insert on public.products
  for each row execute function public.set_product_slug();

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

-- categories: everyone reads active; platform admins manage.
create policy "categories: public read"
  on public.categories for select
  using (is_active or public.is_platform_admin());

create policy "categories: platform admin write"
  on public.categories for insert
  with check (public.is_platform_admin());

create policy "categories: platform admin update"
  on public.categories for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "categories: platform admin delete"
  on public.categories for delete
  using (public.is_platform_admin());

-- products: public read of active products from active vendors.
create policy "products: public read active"
  on public.products for select
  using (status = 'active' and public.is_public_vendor(vendor_id));

-- products: platform admins read and moderate everything.
create policy "products: platform admin read"
  on public.products for select
  using (public.is_platform_admin());

-- products: vendor members read their own products regardless of status.
create policy "products: members read own"
  on public.products for select
  using (public.is_vendor_member(vendor_id));

-- products: managers/owners create and edit; owners delete.
create policy "products: manager write"
  on public.products for insert
  with check (public.is_vendor_manager(vendor_id) or public.is_platform_admin());

create policy "products: manager update"
  on public.products for update
  using (public.is_vendor_manager(vendor_id) or public.is_platform_admin())
  with check (public.is_vendor_manager(vendor_id) or public.is_platform_admin());

create policy "products: owner delete"
  on public.products for delete
  using (public.is_vendor_owner(vendor_id) or public.is_platform_admin());

-- product_images: public read of images for public products.
create policy "product_images: public read"
  on public.product_images for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and p.status = 'active'
        and public.is_public_vendor(p.vendor_id)
    )
  );

-- product_images: managers/owners manage their own product's images.
create policy "product_images: manager write"
  on public.product_images for insert
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.is_vendor_manager(p.vendor_id) or public.is_platform_admin())
    )
  );

create policy "product_images: manager update"
  on public.product_images for update
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.is_vendor_manager(p.vendor_id) or public.is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.is_vendor_manager(p.vendor_id) or public.is_platform_admin())
    )
  );

create policy "product_images: owner delete"
  on public.product_images for delete
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.is_vendor_owner(p.vendor_id) or public.is_platform_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------------

-- Public storefront reads (RLS restricts rows to public/active content).
grant select on table public.categories, public.products, public.product_images to anon;

-- Vendors and admins need full DML; RLS is the actual boundary.
grant select, insert, update, delete on table
  public.categories,
  public.products,
  public.product_images
to authenticated;
