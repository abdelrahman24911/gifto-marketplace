-- Gifto Marketplace — occasion discovery and approved product tagging
--
-- Adds the database foundation for admin-managed occasions:
--   * occasions + collision-safe slugs + permanent old-slug redirects
--   * manual product curation, category matching and approved-tag matching
--   * a shared tag vocabulary with vendor suggestions and admin review
--   * a deterministic, deduplicated matching RPC for public pages
--   * a public-read `occasion-images` Storage bucket for admin uploads
--
-- Security model:
--   * Platform admins manage occasions, rules, tags and suggestions through
--     `public.is_platform_admin()` and RLS.
--   * Vendors may read active tags, assign active tags to products they
--     manage, and submit tag suggestions for their active shop. They cannot
--     create global tags or review suggestions.
--   * Anonymous visitors may read published occasions, their public matching
--     products, active tags, and published occasion slug redirects.
--
-- Product visibility deliberately reuses the existing public catalog rules
-- (`status = 'active'` and `public.is_public_vendor`). Paused shops remain
-- visible, matching the current storefront and shop-page behavior.

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

create type public.occasion_match_mode as enum ('manual', 'automatic', 'hybrid');
create type public.tag_suggestion_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- occasions — admin-managed discovery entry point
-- ---------------------------------------------------------------------------

create table public.occasions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 2 and 80),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description  text check (description is null or length(description) <= 2000),
  image_path   text check (
                 image_path is null
                 or image_path ~* ('^' || id::text || '/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$')
               ),
  image_alt    text check (image_alt is null or length(image_alt) <= 200),
  is_active    boolean not null default false,
  sort_order   integer not null default 0 check (sort_order >= 0),
  match_mode   public.occasion_match_mode not null default 'hybrid',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.occasions is
  'Admin-managed shopping occasions. is_active=false keeps an occasion in draft.';
comment on column public.occasions.match_mode is
  'manual = curated products only; automatic = category/tag rules only; hybrid = both.';

-- Old slugs are retained forever so previously published occasion URLs keep
-- resolving after an admin renames an occasion. Current occasion slugs always
-- take precedence, and the guard trigger below prevents a redirect from
-- shadowing a live slug.
create table public.occasion_slug_redirects (
  id          uuid primary key default gen_random_uuid(),
  old_slug    text not null unique check (old_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  occasion_id uuid not null references public.occasions (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tags — shared, admin-approved vocabulary
-- ---------------------------------------------------------------------------

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 2 and 60),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (description is null or length(description) <= 500),
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null
              default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tags is
  'Admin-approved global tag vocabulary used by occasion matching and vendor product tagging.';

-- ---------------------------------------------------------------------------
-- Occasion matching rules and manual curation
-- ---------------------------------------------------------------------------

create table public.occasion_products (
  occasion_id uuid not null references public.occasions (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  sort_order  integer not null default 0 check (sort_order >= 0),
  created_at  timestamptz not null default now(),
  primary key (occasion_id, product_id)
);

create table public.occasion_categories (
  occasion_id uuid not null references public.occasions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (occasion_id, category_id)
);

create table public.occasion_tags (
  occasion_id uuid not null references public.occasions (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (occasion_id, tag_id)
);

-- Approved tags applied to products. Vendors manage these rows for their own
-- products; admins may curate any product. The insert trigger enforces active
-- tags and the ten-tag ceiling under a product row lock.
create table public.product_tags (
  product_id uuid not null references public.products (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
             default auth.uid(),
  primary key (product_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- tag_suggestions — vendor submissions reviewed by platform admins
-- ---------------------------------------------------------------------------

create table public.tag_suggestions (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) between 2 and 60),
  normalized_slug   text not null check (normalized_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description       text check (description is null or length(description) <= 500),
  suggested_by      uuid references public.profiles (id) on delete set null
                    default auth.uid(),
  vendor_id         uuid not null references public.vendors (id) on delete cascade,
  status            public.tag_suggestion_status not null default 'pending',
  reviewed_by       uuid references public.profiles (id) on delete set null,
  reviewed_at       timestamptz,
  rejection_reason  text check (rejection_reason is null or length(rejection_reason) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tag_suggestions_review_state check (
    (status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
      and rejection_reason is null)
    or (status = 'approved'
      and reviewed_by is not null
      and reviewed_at is not null
      and rejection_reason is null)
    or (status = 'rejected'
      and reviewed_by is not null
      and reviewed_at is not null)
  )
);

comment on table public.tag_suggestions is
  'Vendor-submitted tag proposals. Only admins can approve or reject them; approval creates or reuses a global tag.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index occasions_active_sort_idx
  on public.occasions (sort_order, created_at desc)
  where is_active;

create index occasion_slug_redirects_occasion_idx
  on public.occasion_slug_redirects (occasion_id);

create index tags_active_name_idx
  on public.tags (name)
  where is_active;

create index product_tags_tag_product_idx
  on public.product_tags (tag_id, product_id);

create index occasion_products_sort_idx
  on public.occasion_products (occasion_id, sort_order, created_at);

create index occasion_products_product_idx
  on public.occasion_products (product_id);

create index occasion_categories_category_idx
  on public.occasion_categories (category_id);

create index occasion_tags_tag_idx
  on public.occasion_tags (tag_id);

create index tag_suggestions_vendor_idx
  on public.tag_suggestions (vendor_id, created_at desc);

create index tag_suggestions_status_idx
  on public.tag_suggestions (status, created_at desc);

create index tag_suggestions_suggester_idx
  on public.tag_suggestions (suggested_by, created_at desc);

-- A vendor cannot have two simultaneous pending proposals for the same term.
-- Different vendors may propose the same term; approval reuses one global tag.
create unique index tag_suggestions_pending_unique_idx
  on public.tag_suggestions (vendor_id, normalized_slug)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger occasions_set_updated_at
  before update on public.occasions
  for each row execute function public.set_updated_at();

create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();

create trigger tag_suggestions_set_updated_at
  before update on public.tag_suggestions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Occasion slugs and permanent redirects
-- ---------------------------------------------------------------------------

create or replace function public.set_occasion_slug()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_base      text;
  v_slug      text;
  v_try       integer := 1;
  v_requested text;
begin
  new.name := btrim(new.name);

  -- A name-only edit keeps the existing public URL stable.
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  v_requested := nullif(public.slugify(new.slug), '');
  if v_requested is null then
    v_requested := public.slugify(new.name);
  end if;

  if v_requested is null or v_requested = '' then
    raise exception 'Occasion name must contain at least one letter or number.'
      using errcode = '22023';
  end if;

  v_base := v_requested;
  v_slug := v_base;

  -- Current slugs and redirects belonging to OTHER occasions are avoided.
  -- Redirects belonging to this same occasion are ignored so an admin can
  -- intentionally cycle a slug back to an older value.
  while exists (
    select 1
      from public.occasions o
     where o.slug = v_slug
       and o.id is distinct from new.id
  ) or exists (
    select 1
      from public.occasion_slug_redirects r
     where r.old_slug = v_slug
       and r.occasion_id is distinct from new.id
  ) loop
    v_try := v_try + 1;
    if v_try > 100 then
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
    v_slug := v_base || '-' || v_try::text;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

revoke all on function public.set_occasion_slug() from public, anon, authenticated;

create trigger occasions_set_slug
  before insert or update of name, slug on public.occasions
  for each row execute function public.set_occasion_slug();

create or replace function public.capture_occasion_slug_redirect()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.slug is distinct from old.slug then
    -- The slug becoming current can no longer be a redirect target.
    delete from public.occasion_slug_redirects
     where old_slug = new.slug;

    insert into public.occasion_slug_redirects (old_slug, occasion_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update
      set occasion_id = excluded.occasion_id,
          created_at = now();
  end if;
  return null;
end;
$$;

revoke all on function public.capture_occasion_slug_redirect()
  from public, anon, authenticated;

create trigger occasions_capture_slug_redirect
  after update of slug on public.occasions
  for each row execute function public.capture_occasion_slug_redirect();

create or replace function public.guard_occasion_slug_redirect()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.old_slug is null
     or new.old_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'A redirect slug must be normalized.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.occasions o where o.slug = new.old_slug
  ) then
    raise exception 'Slug "%" is currently used by an occasion and cannot be a redirect.',
      new.old_slug
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_occasion_slug_redirect()
  from public, anon, authenticated;

create trigger occasion_slug_redirects_guard
  before insert or update of old_slug, occasion_id
  on public.occasion_slug_redirects
  for each row execute function public.guard_occasion_slug_redirect();

-- ---------------------------------------------------------------------------
-- Tag slug derivation
-- ---------------------------------------------------------------------------

create or replace function public.set_tag_slug()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_try  integer := 1;
begin
  new.name := btrim(new.name);

  -- Renaming a tag without touching its slug keeps existing URLs/links stable.
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  v_base := nullif(public.slugify(new.slug), '');
  if v_base is null then
    v_base := public.slugify(new.name);
  end if;

  if v_base is null or v_base = '' then
    raise exception 'Tag name must contain at least one letter or number.'
      using errcode = '22023';
  end if;

  v_slug := v_base;
  while exists (
    select 1 from public.tags t
     where t.slug = v_slug
       and t.id is distinct from new.id
  ) loop
    v_try := v_try + 1;
    if v_try > 100 then
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
    v_slug := v_base || '-' || v_try::text;
  end loop;

  new.slug := v_slug;
  return new;
end;
$$;

revoke all on function public.set_tag_slug() from public, anon, authenticated;

create trigger tags_set_slug
  before insert or update of name, slug on public.tags
  for each row execute function public.set_tag_slug();

-- ---------------------------------------------------------------------------
-- Tag assignment guards
-- ---------------------------------------------------------------------------

create or replace function public.validate_product_tag()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from public.tags t
     where t.id = new.tag_id
       and t.is_active
  ) then
    raise exception 'Only active approved tags can be assigned to products.'
      using errcode = '23514';
  end if;

  -- Serializes concurrent inserts for the same product so the ten-tag cap
  -- cannot be bypassed by two simultaneous assignments.
  perform 1
    from public.products p
   where p.id = new.product_id
   for update;

  if not found then
    raise exception 'Product not found.' using errcode = '23503';
  end if;

  select count(*)
    into v_count
    from public.product_tags pt
   where pt.product_id = new.product_id;

  if v_count >= 10 then
    raise exception 'A product can have at most 10 tags.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_product_tag() from public, anon, authenticated;

create trigger product_tags_validate
  before insert on public.product_tags
  for each row execute function public.validate_product_tag();

create or replace function public.validate_occasion_tag()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tags t
     where t.id = new.tag_id
       and t.is_active
  ) then
    raise exception 'Only active approved tags can be used for occasion matching.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_occasion_tag() from public, anon, authenticated;

create trigger occasion_tags_validate
  before insert on public.occasion_tags
  for each row execute function public.validate_occasion_tag();

-- ---------------------------------------------------------------------------
-- Tag suggestion normalization
-- ---------------------------------------------------------------------------

create or replace function public.normalize_tag_suggestion()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.description := nullif(btrim(new.description), '');

  if new.name is null or length(new.name) < 2 then
    raise exception 'A tag suggestion needs a name of at least 2 characters.'
      using errcode = '22023';
  end if;

  new.normalized_slug := public.slugify(new.name);
  if new.normalized_slug is null or new.normalized_slug = '' then
    raise exception 'A tag suggestion must contain at least one letter or number.'
      using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
    if auth.uid() is not null then
      new.suggested_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_tag_suggestion()
  from public, anon, authenticated;

create trigger tag_suggestions_normalize
  before insert or update of name, normalized_slug
  on public.tag_suggestions
  for each row execute function public.normalize_tag_suggestion();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.occasions enable row level security;
alter table public.occasion_slug_redirects enable row level security;
alter table public.tags enable row level security;
alter table public.occasion_products enable row level security;
alter table public.occasion_categories enable row level security;
alter table public.occasion_tags enable row level security;
alter table public.product_tags enable row level security;
alter table public.tag_suggestions enable row level security;

-- occasions: public reads published rows; admins manage everything.
create policy "occasions: public read"
  on public.occasions for select
  to anon, authenticated
  using (is_active or public.is_platform_admin());

create policy "occasions: admin insert"
  on public.occasions for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "occasions: admin update"
  on public.occasions for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "occasions: admin delete"
  on public.occasions for delete
  to authenticated
  using (public.is_platform_admin());

-- slug redirects: public resolution only for published occasions.
create policy "occasion slug redirects: public read"
  on public.occasion_slug_redirects for select
  to anon, authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.occasions o
       where o.id = occasion_id
         and o.is_active
    )
  );

create policy "occasion slug redirects: admin insert"
  on public.occasion_slug_redirects for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "occasion slug redirects: admin update"
  on public.occasion_slug_redirects for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "occasion slug redirects: admin delete"
  on public.occasion_slug_redirects for delete
  to authenticated
  using (public.is_platform_admin());

-- tags: everyone reads active tags; only admins manage the vocabulary.
create policy "tags: public read"
  on public.tags for select
  to anon, authenticated
  using (is_active or public.is_platform_admin());

create policy "tags: admin insert"
  on public.tags for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "tags: admin update"
  on public.tags for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "tags: admin delete"
  on public.tags for delete
  to authenticated
  using (public.is_platform_admin());

-- occasion_products: public sees manual picks only while occasion and product
-- are public; admins manage all rows.
create policy "occasion_products: public read"
  on public.occasion_products for select
  to anon, authenticated
  using (
    public.is_platform_admin()
    or (
      exists (
        select 1 from public.occasions o
         where o.id = occasion_id
           and o.is_active
      )
      and exists (
        select 1 from public.products p
         where p.id = product_id
           and p.status = 'active'
           and public.is_public_vendor(p.vendor_id)
      )
    )
  );

create policy "occasion_products: admin insert"
  on public.occasion_products for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "occasion_products: admin update"
  on public.occasion_products for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "occasion_products: admin delete"
  on public.occasion_products for delete
  to authenticated
  using (public.is_platform_admin());

-- occasion_categories: public sees rules only for active occasions/categories.
create policy "occasion_categories: public read"
  on public.occasion_categories for select
  to anon, authenticated
  using (
    public.is_platform_admin()
    or (
      exists (
        select 1 from public.occasions o
         where o.id = occasion_id
           and o.is_active
      )
      and exists (
        select 1 from public.categories c
         where c.id = category_id
           and c.is_active
      )
    )
  );

create policy "occasion_categories: admin insert"
  on public.occasion_categories for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "occasion_categories: admin delete"
  on public.occasion_categories for delete
  to authenticated
  using (public.is_platform_admin());

-- occasion_tags: public sees rules only for active occasions and active tags.
create policy "occasion_tags: public read"
  on public.occasion_tags for select
  to anon, authenticated
  using (
    public.is_platform_admin()
    or (
      exists (
        select 1 from public.occasions o
         where o.id = occasion_id
           and o.is_active
      )
      and exists (
        select 1 from public.tags t
         where t.id = tag_id
           and t.is_active
      )
    )
  );

create policy "occasion_tags: admin insert"
  on public.occasion_tags for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "occasion_tags: admin delete"
  on public.occasion_tags for delete
  to authenticated
  using (public.is_platform_admin());

-- product_tags: public sees active tags on public products; vendors see and
-- manage assignments for products they manage; admins see/manage everything.
create policy "product_tags: public read"
  on public.product_tags for select
  to anon, authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.products p
       where p.id = product_tags.product_id
         and public.is_vendor_manager(p.vendor_id)
    )
    or exists (
      select 1
        from public.products p
        join public.tags t on t.id = product_tags.tag_id
       where p.id = product_tags.product_id
         and p.status = 'active'
         and public.is_public_vendor(p.vendor_id)
         and t.is_active
    )
  );

create policy "product_tags: manager insert"
  on public.product_tags for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tags t
       where t.id = tag_id
         and t.is_active
    )
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.products p
         where p.id = product_id
           and public.is_vendor_manager(p.vendor_id)
      )
    )
  );

create policy "product_tags: manager delete"
  on public.product_tags for delete
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.products p
       where p.id = product_id
         and public.is_vendor_manager(p.vendor_id)
    )
  );

-- tag_suggestions: vendors see and create suggestions for their active shop;
-- admins see the whole queue. Review changes go through the RPC below so
-- approval can create the global tag atomically.
create policy "tag suggestions: vendor read"
  on public.tag_suggestions for select
  to authenticated
  using (
    public.is_vendor_active_member(vendor_id)
    or public.is_platform_admin()
  );

create policy "tag suggestions: vendor insert"
  on public.tag_suggestions for insert
  to authenticated
  with check (
    public.is_vendor_active_member(vendor_id)
    and suggested_by = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
  );

-- ---------------------------------------------------------------------------
-- Matching RPC
--
-- Public read model. Returns the customer-visible collection for one occasion:
--   1. manual products, ordered by occasion_products.sort_order
--   2. automatic category/tag matches, newest first
--   3. manual matches removed from the automatic pool (deduplicated)
--   4. only active products from public active vendors
--   5. only active categories and active approved tags
--
-- Paused shops remain visible because is_public_vendor() only checks the vendor
-- status, matching existing shop pages and checkout behavior.
-- ---------------------------------------------------------------------------

create or replace function public.get_occasion_products(
  p_occasion_id uuid,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id          uuid,
  vendor_id   uuid,
  category_id uuid,
  name        text,
  slug        text,
  description text,
  price_minor integer,
  currency    text,
  stock       integer,
  status      public.product_status,
  created_at  timestamptz,
  updated_at  timestamptz,
  is_manual   boolean,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with visible_occasion as (
    select o.id, o.match_mode
      from public.occasions o
     where o.id = p_occasion_id
  ),
  manual as (
    select op.product_id,
           op.sort_order,
           p.created_at
      from public.occasion_products op
      join visible_occasion o on o.id = op.occasion_id
      join public.products p on p.id = op.product_id
     where o.match_mode in ('manual', 'hybrid')
       and p.status = 'active'
       and public.is_public_vendor(p.vendor_id)
  ),
  category_matches as (
    select distinct p.id as product_id,
                    p.created_at
      from public.occasion_categories oc
      join visible_occasion o on o.id = oc.occasion_id
      join public.categories c on c.id = oc.category_id
      join public.products p on p.category_id = c.id
     where o.match_mode in ('automatic', 'hybrid')
       and c.is_active
       and p.status = 'active'
       and public.is_public_vendor(p.vendor_id)
  ),
  tag_matches as (
    select distinct p.id as product_id,
                    p.created_at
      from public.occasion_tags ot
      join visible_occasion o on o.id = ot.occasion_id
      join public.tags t on t.id = ot.tag_id
      join public.product_tags pt on pt.tag_id = t.id
      join public.products p on p.id = pt.product_id
     where o.match_mode in ('automatic', 'hybrid')
       and t.is_active
       and p.status = 'active'
       and public.is_public_vendor(p.vendor_id)
  ),
  automatic as (
    select a.product_id, a.created_at
      from (
        select product_id, created_at from category_matches
        union
        select product_id, created_at from tag_matches
      ) a
     where not exists (
       select 1 from manual m where m.product_id = a.product_id
     )
  ),
  combined as (
    select m.product_id,
           true as is_manual,
           m.sort_order,
           m.created_at
      from manual m
    union all
    select a.product_id,
           false as is_manual,
           null::integer as sort_order,
           a.created_at
      from automatic a
  ),
  ranked as (
    select c.product_id,
           c.is_manual,
           row_number() over (
             order by c.is_manual desc,
                      case when c.is_manual then c.sort_order end asc nulls last,
                      c.created_at desc,
                      c.product_id
           ) as rn,
           count(*) over () as total_count
      from combined c
  )
  select p.id,
         p.vendor_id,
         p.category_id,
         p.name,
         p.slug,
         p.description,
         p.price_minor,
         p.currency,
         p.stock,
         p.status,
         p.created_at,
         p.updated_at,
         r.is_manual,
         r.total_count
    from ranked r
    join public.products p on p.id = r.product_id
   where r.rn > greatest(coalesce(p_offset, 0), 0)
     and r.rn <= greatest(coalesce(p_offset, 0), 0)
                 + least(greatest(coalesce(p_limit, 24), 1), 100)
   order by r.rn;
$$;

revoke all on function public.get_occasion_products(uuid, integer, integer)
  from public;
grant execute on function public.get_occasion_products(uuid, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin curation RPCs
-- ---------------------------------------------------------------------------

create or replace function public.replace_occasion_products(
  p_occasion_id uuid,
  p_product_ids uuid[]
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can manage occasions.'
      using errcode = '42501';
  end if;

  if p_occasion_id is null
     or not exists (select 1 from public.occasions o where o.id = p_occasion_id) then
    raise exception 'Occasion not found.' using errcode = '22023';
  end if;

  v_ids := array(
    select t.id
      from unnest(coalesce(p_product_ids, '{}'::uuid[])) with ordinality as t(id, ord)
     where t.id is not null
     group by t.id
     order by min(t.ord)
  );

  if coalesce(array_length(v_ids, 1), 0) > 500 then
    raise exception 'An occasion can have at most 500 manually selected products.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(v_ids) as t(id)
     where not exists (select 1 from public.products p where p.id = t.id)
  ) then
    raise exception 'One or more selected products do not exist.'
      using errcode = '22023';
  end if;

  delete from public.occasion_products where occasion_id = p_occasion_id;
  insert into public.occasion_products (occasion_id, product_id, sort_order)
  select p_occasion_id, t.id, (t.ord - 1)::integer
    from unnest(v_ids) with ordinality as t(id, ord);
end;
$$;

revoke all on function public.replace_occasion_products(uuid, uuid[])
  from public, anon;
grant execute on function public.replace_occasion_products(uuid, uuid[])
  to authenticated;

create or replace function public.replace_occasion_categories(
  p_occasion_id uuid,
  p_category_ids uuid[]
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can manage occasions.'
      using errcode = '42501';
  end if;

  if p_occasion_id is null
     or not exists (select 1 from public.occasions o where o.id = p_occasion_id) then
    raise exception 'Occasion not found.' using errcode = '22023';
  end if;

  v_ids := array(
    select t.id
      from unnest(coalesce(p_category_ids, '{}'::uuid[])) with ordinality as t(id, ord)
     where t.id is not null
     group by t.id
     order by min(t.ord)
  );

  if exists (
    select 1 from unnest(v_ids) as t(id)
     where not exists (select 1 from public.categories c where c.id = t.id)
  ) then
    raise exception 'One or more selected categories do not exist.'
      using errcode = '22023';
  end if;

  delete from public.occasion_categories where occasion_id = p_occasion_id;
  insert into public.occasion_categories (occasion_id, category_id)
  select p_occasion_id, t.id
    from unnest(v_ids) as t(id);
end;
$$;

revoke all on function public.replace_occasion_categories(uuid, uuid[])
  from public, anon;
grant execute on function public.replace_occasion_categories(uuid, uuid[])
  to authenticated;

create or replace function public.replace_occasion_tags(
  p_occasion_id uuid,
  p_tag_ids uuid[]
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can manage occasions.'
      using errcode = '42501';
  end if;

  if p_occasion_id is null
     or not exists (select 1 from public.occasions o where o.id = p_occasion_id) then
    raise exception 'Occasion not found.' using errcode = '22023';
  end if;

  v_ids := array(
    select t.id
      from unnest(coalesce(p_tag_ids, '{}'::uuid[])) with ordinality as t(id, ord)
     where t.id is not null
     group by t.id
     order by min(t.ord)
  );

  if exists (
    select 1 from unnest(v_ids) as t(id)
     where not exists (
       select 1 from public.tags tag
        where tag.id = t.id
          and tag.is_active
     )
  ) then
    raise exception 'Only active approved tags can be used for occasion matching.'
      using errcode = '23514';
  end if;

  delete from public.occasion_tags where occasion_id = p_occasion_id;
  insert into public.occasion_tags (occasion_id, tag_id)
  select p_occasion_id, t.id
    from unnest(v_ids) as t(id);
end;
$$;

revoke all on function public.replace_occasion_tags(uuid, uuid[])
  from public, anon;
grant execute on function public.replace_occasion_tags(uuid, uuid[])
  to authenticated;

create or replace function public.reorder_occasions(p_occasion_ids uuid[])
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can reorder occasions.'
      using errcode = '42501';
  end if;

  v_ids := array(
    select t.id
      from unnest(coalesce(p_occasion_ids, '{}'::uuid[])) with ordinality as t(id, ord)
     where t.id is not null
     group by t.id
     order by min(t.ord)
  );

  if exists (
    select 1 from unnest(v_ids) as t(id)
     where not exists (select 1 from public.occasions o where o.id = t.id)
  ) then
    raise exception 'One or more occasions do not exist.'
      using errcode = '22023';
  end if;

  update public.occasions o
     set sort_order = (t.ord - 1)::integer
    from unnest(v_ids) with ordinality as t(id, ord)
   where o.id = t.id;
end;
$$;

revoke all on function public.reorder_occasions(uuid[])
  from public, anon;
grant execute on function public.reorder_occasions(uuid[])
  to authenticated;

-- Vendor-safe product tag replacement. SECURITY INVOKER so the existing
-- product RLS policies remain a second enforcement layer; the explicit
-- ownership check below makes the operation safe even before RLS evaluates.
create or replace function public.replace_product_tags(
  p_product_id uuid,
  p_tag_ids uuid[]
)
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  v_vendor_id uuid;
  v_ids       uuid[];
begin
  if p_product_id is null then
    raise exception 'Product is required.' using errcode = '22023';
  end if;

  select p.vendor_id
    into v_vendor_id
    from public.products p
   where p.id = p_product_id;

  if v_vendor_id is null then
    raise exception 'Product not found.' using errcode = '22023';
  end if;

  if not (public.is_vendor_manager(v_vendor_id) or public.is_platform_admin()) then
    raise exception 'You cannot manage tags for this product.'
      using errcode = '42501';
  end if;

  v_ids := array(
    select t.id
      from unnest(coalesce(p_tag_ids, '{}'::uuid[])) with ordinality as t(id, ord)
     where t.id is not null
     group by t.id
     order by min(t.ord)
  );

  if coalesce(array_length(v_ids, 1), 0) > 10 then
    raise exception 'A product can have at most 10 tags.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(v_ids) as t(id)
     where not exists (
       select 1 from public.tags tag
        where tag.id = t.id
          and tag.is_active
     )
  ) then
    raise exception 'Only active approved tags can be assigned to products.'
      using errcode = '23514';
  end if;

  -- Advisory transactions serialize concurrent replacements without requiring
  -- UPDATE privilege on products (column grants restrict vendor updates).
  perform pg_advisory_xact_lock(hashtext(p_product_id::text)::bigint);

  delete from public.product_tags where product_id = p_product_id;
  insert into public.product_tags (product_id, tag_id)
  select p_product_id, t.id
    from unnest(v_ids) as t(id);
end;
$$;

revoke all on function public.replace_product_tags(uuid, uuid[])
  from public, anon;
grant execute on function public.replace_product_tags(uuid, uuid[])
  to authenticated;

-- Atomically approve or reject a pending suggestion. Approval creates or
-- reuses the global tag (and reactivates it if it had been deactivated).
create or replace function public.review_tag_suggestion(
  p_suggestion_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_status      public.tag_suggestion_status;
  v_slug        text;
  v_name        text;
  v_desc        text;
  v_tag_id      uuid;
  v_tag_active  boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can review tag suggestions.'
      using errcode = '42501';
  end if;

  if p_approve is null then
    raise exception 'A review decision is required.' using errcode = '22023';
  end if;

  select status, normalized_slug, name, description
    into v_status, v_slug, v_name, v_desc
    from public.tag_suggestions
   where id = p_suggestion_id
   for update;

  if not found then
    raise exception 'Tag suggestion not found.' using errcode = '22023';
  end if;

  if v_status <> 'pending' then
    raise exception 'This tag suggestion has already been reviewed.'
      using errcode = '23514';
  end if;

  if p_approve then
    -- The tag slug trigger makes admin-created slugs collision-safe by
    -- suffixing them. Approval must instead reuse an existing active tag, so
    -- check/lock first rather than relying on ON CONFLICT, which the trigger
    -- would turn into a new suffixed slug.
    perform pg_advisory_xact_lock(hashtext(v_slug)::bigint);

    select id, is_active
      into v_tag_id, v_tag_active
      from public.tags
     where slug = v_slug;

    if v_tag_id is null then
      insert into public.tags (name, slug, description, created_by)
      values (v_name, v_slug, v_desc, auth.uid())
      returning id into v_tag_id;
    elsif not v_tag_active then
      update public.tags
         set is_active = true
       where id = v_tag_id;
    end if;

    update public.tag_suggestions
       set status = 'approved',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           rejection_reason = null
     where id = p_suggestion_id;
  else
    if p_rejection_reason is not null
       and length(p_rejection_reason) > 500 then
      raise exception 'A rejection reason must be 500 characters or fewer.'
        using errcode = '22023';
    end if;

    update public.tag_suggestions
       set status = 'rejected',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           rejection_reason = nullif(btrim(p_rejection_reason), '')
     where id = p_suggestion_id;

    v_tag_id := null;
  end if;

  return v_tag_id;
end;
$$;

revoke all on function public.review_tag_suggestion(uuid, boolean, text)
  from public, anon;
grant execute on function public.review_tag_suggestion(uuid, boolean, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Least-privilege grants
--
-- Supabase grants broad default privileges on new public relations. Revoke
-- them explicitly, then grant only what the user-scoped client needs. RLS is
-- the actual row boundary. Column-level grants prevent vendors from spoofing
-- server-owned fields (status, sort order, created_by, review state, etc.).
-- ---------------------------------------------------------------------------

revoke all on table
  public.occasions,
  public.occasion_slug_redirects,
  public.tags,
  public.occasion_products,
  public.occasion_categories,
  public.occasion_tags,
  public.product_tags,
  public.tag_suggestions
from public, anon, authenticated;

grant select on table
  public.occasions,
  public.occasion_slug_redirects,
  public.tags,
  public.occasion_products,
  public.occasion_categories,
  public.occasion_tags,
  public.product_tags
to anon, authenticated;

grant select on table public.tag_suggestions to authenticated;

grant insert (name, slug, description, image_path, image_alt, is_active, sort_order, match_mode)
  on table public.occasions to authenticated;
grant update (name, slug, description, image_path, image_alt, is_active, sort_order, match_mode)
  on table public.occasions to authenticated;
grant delete on table public.occasions to authenticated;

grant insert (old_slug, occasion_id)
  on table public.occasion_slug_redirects to authenticated;
grant delete on table public.occasion_slug_redirects to authenticated;

grant insert (name, slug, description, is_active)
  on table public.tags to authenticated;
grant update (name, slug, description, is_active)
  on table public.tags to authenticated;
grant delete on table public.tags to authenticated;

grant insert (occasion_id, product_id, sort_order)
  on table public.occasion_products to authenticated;
grant update (sort_order) on table public.occasion_products to authenticated;
grant delete on table public.occasion_products to authenticated;

grant insert (occasion_id, category_id)
  on table public.occasion_categories to authenticated;
grant delete on table public.occasion_categories to authenticated;

grant insert (occasion_id, tag_id)
  on table public.occasion_tags to authenticated;
grant delete on table public.occasion_tags to authenticated;

grant insert (product_id, tag_id)
  on table public.product_tags to authenticated;
grant delete on table public.product_tags to authenticated;

grant insert (vendor_id, name, description)
  on table public.tag_suggestions to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public-read occasion images, admin-only writes
--
-- Objects live at `{occasion_id}/{uuid}.{ext}`. The policy requires exactly
-- one folder segment, a UUID folder, and an existing occasion, so an admin
-- cannot accidentally write outside an occasion namespace. Bucket settings
-- enforce 5 MB and JPEG/PNG/WebP at the Storage API layer.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'occasion-images',
  'occasion-images',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "occasion images: public read" on storage.objects;
create policy "occasion images: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'occasion-images');

drop policy if exists "occasion images: admin upload" on storage.objects;
create policy "occasion images: admin upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'occasion-images'
    and array_length(storage.foldername(objects.name), 1) = 1
    and (storage.foldername(objects.name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.occasions o
       where o.id::text = (storage.foldername(objects.name))[1]
    )
    and public.is_platform_admin()
  );

drop policy if exists "occasion images: admin update" on storage.objects;
create policy "occasion images: admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'occasion-images'
    and array_length(storage.foldername(objects.name), 1) = 1
    and (storage.foldername(objects.name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.occasions o
       where o.id::text = (storage.foldername(objects.name))[1]
    )
    and public.is_platform_admin()
  )
  with check (
    bucket_id = 'occasion-images'
    and array_length(storage.foldername(objects.name), 1) = 1
    and (storage.foldername(objects.name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.occasions o
       where o.id::text = (storage.foldername(objects.name))[1]
    )
    and public.is_platform_admin()
  );

drop policy if exists "occasion images: admin delete" on storage.objects;
create policy "occasion images: admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'occasion-images'
    and array_length(storage.foldername(objects.name), 1) = 1
    and (storage.foldername(objects.name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.occasions o
       where o.id::text = (storage.foldername(objects.name))[1]
    )
    and public.is_platform_admin()
  );
