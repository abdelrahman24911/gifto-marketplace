-- Product reviews (UX Batch 2): basic ratings + written reviews from
-- verified buyers only, moderation-first.
--
-- Design:
--   * One review per (product, user). A review is born 'pending' and only
--     becomes public when a platform admin approves it — nothing is ever
--     seeded, and no review is public without a real delivered purchase
--     behind it.
--   * "Verified buyer" means the author has a delivered suborder that
--     contains the product (order_items -> order_vendors status
--     'delivered', parent order owned by the author). Guest orders have
--     no account to tie a review to, so guests cannot review.
--   * Writes go through RPCs only (no insert/update/delete policies):
--     submit_product_review enforces verified-buyer + one-per-user +
--     rating/body validation; moderate_product_review is admin-only and
--     only moves a pending review.
--   * Reads: anyone (anon included) reads approved reviews; the author
--     reads their own in any status; a shop's members read reviews on
--     their own products in any status; admins read everything.
--   * The author's display name is snapshotted at submit time (first
--     name only) so the storefront never needs to read other customers'
--     profiles. A review keeps the name it was submitted with.

create table public.product_reviews (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  rating       int not null check (rating between 1 and 5),
  body         text check (body is null or length(trim(body)) between 1 and 1000),
  author_name  text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  constraint product_reviews_moderation_state check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  unique (product_id, user_id)
);

comment on table public.product_reviews is
  'Customer reviews (UX Batch 2): one per (product, user), born pending, public only after admin approval. Verified-buyer only — see submit_product_review.';

create index product_reviews_product_idx
  on public.product_reviews (product_id, status, created_at desc);
create index product_reviews_user_idx
  on public.product_reviews (user_id, created_at desc);

alter table public.product_reviews enable row level security;

-- Anyone reads approved reviews (the storefront list is public).
create policy "product_reviews: public read approved"
  on public.product_reviews for select
  using (status = 'approved');

-- The author reads their own review in any status (pending included,
-- so the storefront can show "awaiting moderation").
create policy "product_reviews: author read own"
  on public.product_reviews for select
  using (user_id = auth.uid());

-- A shop's members read reviews on their own products in any status.
create policy "product_reviews: vendor members read own products"
  on public.product_reviews for select
  using (
    exists (
      select 1 from public.products p
       where p.id = product_reviews.product_id
         and public.is_vendor_member(p.vendor_id)
    )
  );

-- Platform admins read everything (the moderation queue).
create policy "product_reviews: platform admin read"
  on public.product_reviews for select
  using (public.is_platform_admin());

-- No insert/update/delete policies: writes go through the RPCs below.
-- Direct writes are refused for every role; the RPCs run security
-- definer and are the only writers.
revoke all on table public.product_reviews from public, anon, authenticated;
grant select on table public.product_reviews to anon, authenticated;

-- ---------------------------------------------------------------------------
-- is_verified_buyer — read helper for the storefront: has the caller
-- received this product in a delivered suborder of their own order?
-- ---------------------------------------------------------------------------

create or replace function public.is_verified_buyer(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.order_items oi
      join public.order_vendors ov on ov.id = oi.order_vendor_id
      join public.orders o on o.id = ov.order_id
     where oi.product_id = p_product_id
       and ov.status = 'delivered'
       and o.user_id = auth.uid()
  );
$$;

revoke all on function public.is_verified_buyer(uuid) from public, anon;
grant execute on function public.is_verified_buyer(uuid) to authenticated;

comment on function public.is_verified_buyer(uuid) is
  'Storefront helper (UX Batch 2): true when the caller received this product in a delivered suborder of their own order. Guests (no account) are never verified buyers.';

-- ---------------------------------------------------------------------------
-- product_review_summary — approved-review count + average rating for a
-- product. The storefront computes nothing from a partial page of rows.
-- ---------------------------------------------------------------------------

create or replace function public.product_review_summary(p_product_id uuid)
returns table (review_count bigint, average_rating numeric)
language sql
stable
security definer
set search_path = public
as $$
  select count(*), round(avg(rating), 1)
    from public.product_reviews
   where product_id = p_product_id
     and status = 'approved';
$$;

revoke all on function public.product_review_summary(uuid) from public, anon;
grant execute on function public.product_review_summary(uuid) to anon, authenticated;

comment on function public.product_review_summary(uuid) is
  'Storefront helper (UX Batch 2): count and one-decimal average of a product''s approved reviews; average is null when there are none.';

-- ---------------------------------------------------------------------------
-- submit_product_review — verified buyers only, one per product, born
-- pending for admin moderation.
-- ---------------------------------------------------------------------------

create or replace function public.submit_product_review(
  p_product_id uuid,
  p_rating int,
  p_body text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_body      text;
  v_author    text;
  v_review_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to review a gift.'
      using errcode = '42501';
  end if;

  if p_product_id is null
     or not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Choose a gift that exists.' using errcode = '22023';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5 stars.' using errcode = '22023';
  end if;

  v_body := nullif(trim(coalesce(p_body, '')), '');
  if v_body is not null and length(v_body) > 1000 then
    raise exception 'A review must be 1000 characters or fewer.'
      using errcode = '22023';
  end if;

  if not public.is_verified_buyer(p_product_id) then
    raise exception 'Only customers who received this gift can review it.'
      using errcode = '23514';
  end if;

  -- First name only, snapshotted so the storefront never reads other
  -- customers' profiles. Null when the profile has no name — the UI
  -- then shows "Verified buyer".
  select nullif(split_part(trim(full_name), ' ', 1), '')
    into v_author
    from public.profiles
   where id = v_uid;

  begin
    insert into public.product_reviews
      (product_id, user_id, rating, body, author_name)
    values (p_product_id, v_uid, p_rating, v_body, v_author)
    returning id into v_review_id;
  exception when unique_violation then
    raise exception 'You have already reviewed this gift.'
      using errcode = '23514';
  end;

  return v_review_id;
end;
$$;

revoke all on function public.submit_product_review(uuid, int, text)
  from public, anon;
grant execute on function public.submit_product_review(uuid, int, text)
  to authenticated;

comment on function public.submit_product_review(uuid, int, text) is
  'Customer review submission (UX Batch 2): verified buyers only (delivered suborder containing the product), one review per (product, user), born pending for admin moderation. Rating 1–5; body optional, at most 1000 characters.';

-- ---------------------------------------------------------------------------
-- moderate_product_review — admin-only; only a pending review moves.
-- ---------------------------------------------------------------------------

create or replace function public.moderate_product_review(
  p_review_id uuid,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can moderate reviews.'
      using errcode = '42501';
  end if;

  select status into v_status
    from public.product_reviews
   where id = p_review_id
   for update;

  if v_status is null then
    raise exception 'Review not found.' using errcode = '22023';
  end if;

  if v_status <> 'pending' then
    raise exception 'This review has already been moderated.'
      using errcode = '23514';
  end if;

  update public.product_reviews
     set status = case when p_approved then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_review_id;
end;
$$;

revoke all on function public.moderate_product_review(uuid, boolean)
  from public, anon;
grant execute on function public.moderate_product_review(uuid, boolean)
  to authenticated;

comment on function public.moderate_product_review(uuid, boolean) is
  'Admin review moderation (UX Batch 2): approves (public) or rejects (hidden) a pending review, exactly once. Approved reviews are the only ones the public read policy exposes.';
