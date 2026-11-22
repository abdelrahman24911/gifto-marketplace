-- Rollback for 00000000000038_product_search_trigram.sql.
--
-- Drops the search_products() RPC and its trigram indexes, restoring the
-- pre-P1-09 search behaviour (application-side ILIKE on the product
-- name). The pg_trgm extension is dropped only if nothing else uses it.

drop function if exists public.search_products(
  text, uuid, integer, integer, integer, integer
);

drop index if exists public.products_description_trgm_idx;
drop index if exists public.products_name_trgm_idx;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where indexdef ilike '%gin_trgm_ops%'
  ) then
    drop extension if exists pg_trgm;
  end if;
end $$;
