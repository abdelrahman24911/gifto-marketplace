-- Rollback for migration 54 (product reviews): drop the RPCs and the
-- table. Reviews are new in this migration, so nothing earlier depends
-- on them; dropping the table removes its policies and indexes too.

drop function if exists public.moderate_product_review(uuid, boolean);
drop function if exists public.submit_product_review(uuid, int, text);
drop function if exists public.product_review_summary(uuid);
drop function if exists public.is_verified_buyer(uuid);
drop table if exists public.product_reviews;
