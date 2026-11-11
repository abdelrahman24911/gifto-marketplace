-- Rollback for 00000000000026_occasion_discovery.sql.
--
-- Removes the occasion discovery schema, tag vocabulary, suggestion queue,
-- matching/curation RPCs and the occasion-images bucket policies.
--
-- Safety:
--   * Refuses while ANY occasion/tag/suggestion/rule row exists, so a rollback
--     cannot silently destroy admin configuration or vendor submissions.
--     Export those tables first (or delete the rows deliberately) and re-run.
--   * Refuses while occasion-images objects still exist. Copy/export the bucket
--     first; this rollback never deletes Storage objects.
--   * Never touches marketplace products, categories, vendors, orders or the
--     existing product-images / vendor-media buckets.
--
-- Dependency order (reverse of the migration):
--   1. storage policies + bucket
--   2. RPCs
--   3. join/config tables
--   4. core tables
--   5. trigger functions
--   6. enum types

-- ---------------------------------------------------------------------------
-- Data-loss guards
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.occasions') is not null
     and exists (select 1 from public.occasions) then
    raise exception 'Refusing to roll back 26: occasion records exist. Export them first.';
  end if;

  if to_regclass('public.occasion_slug_redirects') is not null
     and exists (select 1 from public.occasion_slug_redirects) then
    raise exception 'Refusing to roll back 26: occasion slug redirects exist. Export them first.';
  end if;

  if to_regclass('public.tags') is not null
     and exists (select 1 from public.tags) then
    raise exception 'Refusing to roll back 26: global tags exist. Export them first.';
  end if;

  if to_regclass('public.occasion_products') is not null
     and exists (select 1 from public.occasion_products) then
    raise exception 'Refusing to roll back 26: occasion product curation exists. Export it first.';
  end if;

  if to_regclass('public.occasion_categories') is not null
     and exists (select 1 from public.occasion_categories) then
    raise exception 'Refusing to roll back 26: occasion category rules exist. Export them first.';
  end if;

  if to_regclass('public.occasion_tags') is not null
     and exists (select 1 from public.occasion_tags) then
    raise exception 'Refusing to roll back 26: occasion tag rules exist. Export them first.';
  end if;

  if to_regclass('public.product_tags') is not null
     and exists (select 1 from public.product_tags) then
    raise exception 'Refusing to roll back 26: product tag assignments exist. Export them first.';
  end if;

  if to_regclass('public.tag_suggestions') is not null
     and exists (select 1 from public.tag_suggestions) then
    raise exception 'Refusing to roll back 26: tag suggestions exist. Export them first.';
  end if;

  if to_regclass('storage.objects') is not null
     and exists (
       select 1 from storage.objects where bucket_id = 'occasion-images'
     ) then
    raise exception 'Refusing to roll back 26: occasion-images objects still exist. Copy/export them first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

drop policy if exists "occasion images: admin delete" on storage.objects;
drop policy if exists "occasion images: admin update" on storage.objects;
drop policy if exists "occasion images: admin upload" on storage.objects;
drop policy if exists "occasion images: public read" on storage.objects;

delete from storage.buckets where id = 'occasion-images';

-- ---------------------------------------------------------------------------
-- RPCs (before their tables)
-- ---------------------------------------------------------------------------

drop function if exists public.review_tag_suggestion(uuid, boolean, text);
drop function if exists public.replace_product_tags(uuid, uuid[]);
drop function if exists public.reorder_occasions(uuid[]);
drop function if exists public.replace_occasion_tags(uuid, uuid[]);
drop function if exists public.replace_occasion_categories(uuid, uuid[]);
drop function if exists public.replace_occasion_products(uuid, uuid[]);
drop function if exists public.get_occasion_products(uuid, integer, integer);

-- ---------------------------------------------------------------------------
-- Tables (children before parents)
-- ---------------------------------------------------------------------------

drop table if exists public.tag_suggestions;
drop table if exists public.occasion_tags;
drop table if exists public.product_tags;
drop table if exists public.occasion_categories;
drop table if exists public.occasion_products;
drop table if exists public.occasion_slug_redirects;
drop table if exists public.tags;
drop table if exists public.occasions;

-- ---------------------------------------------------------------------------
-- Trigger functions (their triggers are gone with the tables)
-- ---------------------------------------------------------------------------

drop function if exists public.normalize_tag_suggestion();
drop function if exists public.validate_occasion_tag();
drop function if exists public.validate_product_tag();
drop function if exists public.set_tag_slug();
drop function if exists public.capture_occasion_slug_redirect();
drop function if exists public.guard_occasion_slug_redirect();
drop function if exists public.set_occasion_slug();

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

drop type if exists public.tag_suggestion_status;
drop type if exists public.occasion_match_mode;
