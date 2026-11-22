-- Rollback for migration 56 (R-08): restore the migration 54
-- submit_product_review definition — verified buyers only, with no
-- vendor self-review exclusion.

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
