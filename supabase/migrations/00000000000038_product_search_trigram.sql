-- Gifto Marketplace - P1-09 (M-06): ranked product search on a trigram index.
--
-- The storefront search was a leading-wildcard ILIKE on the product name
-- only: description matches were missed, every search scanned, and LIKE
-- wildcards in user input were unescaped (audit L-12).
--
-- Choice: pg_trgm GIN indexes + a search_products() RPC, not a tsvector
-- column. The query shape is substring / fuzzy-tolerant matching over
-- short product names and descriptions (partial words, typos, mixed
-- English/Arabic catalogue text) — exactly what trigram similarity and
-- ILIKE serve, and what a tsvector dictionary with stemming would miss
-- (tsvector matches whole lexemes, not substrings). A trigram GIN index
-- also makes the leading-wildcard ILIKE itself index-assisted, so the
-- substring branch below does not scan. No new column, no trigger, no
-- language configuration to keep in sync.
--
-- LIKE escaping (L-12): the user-supplied query is escaped in exactly
-- one place — inside this RPC, reusing the approach migration 37
-- (P1-06/N-04) established: backslash, % and _ are escaped and the
-- pattern is matched with an explicit ESCAPE clause, so input matches
-- literally. The application never builds a LIKE pattern.
--
-- Ranking: name matches first. Rows whose name contains the query as a
-- substring sort before description-only matches; within each group the
-- trigram similarity (name, then description) decides, with created_at
-- and id as stable tiebreaks so pagination is stable. An empty query is
-- a browse: newest first. Category and price filters are applied inside
-- the RPC so total_count is the filtered total the UI paginates against
-- (P1-08 shape).
--
-- EXPLAIN ANALYZE before/after is recorded in the P1-09 commit message,
-- measured on a disposable local Postgres seeded with the rls_catalog
-- fixtures plus generated products (see the commit body).

create extension if not exists pg_trgm;

create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops);

create index if not exists products_description_trgm_idx
  on public.products using gin (description gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- search_products — ranked, filtered, paged product search
-- ---------------------------------------------------------------------------
--
-- PL/pgSQL with two branches so the planner sees a clean, indexable OR in
-- the text branch: a NULL-query arm inside the same OR would force a
-- sequential scan (a BitmapOr needs every arm indexable). The browse
-- branch (empty query) is newest-first with no text filter.

create or replace function public.search_products(
  p_query       text    default null,
  p_category_id uuid    default null,
  p_min_minor   integer default null,
  p_max_minor   integer default null,
  p_limit       integer default 25,
  p_offset      integer default 0
)
returns table (
  id          uuid,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q     text := nullif(btrim(coalesce(p_query, '')), '');
  v_lim   integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  -- Single place where a LIKE pattern is built from user input:
  -- escape \, % and _ so the term matches literally (L-12, same
  -- approach as migration 37 / N-04).
  v_pattern text := '%' || replace(
    replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'),
    '_', '\_'
  ) || '%';
begin
  if v_q is null then
    return query
      select
        p.id,
        count(*) over () as total_count
      from public.products p
      where p.status = 'active'
        and public.is_public_vendor(p.vendor_id)
        and (p_category_id is null or p.category_id = p_category_id)
        and (p_min_minor is null or p.price_minor >= p_min_minor)
        and (p_max_minor is null or p.price_minor <= p_max_minor)
      order by p.created_at desc, p.id desc
      limit v_lim
      offset v_off;
    return;
  end if;

  return query
    with matched as (
      select
        p.id,
        p.name,
        p.description,
        p.created_at
      from public.products p
      where p.status = 'active'
        and public.is_public_vendor(p.vendor_id)
        and (p_category_id is null or p.category_id = p_category_id)
        and (p_min_minor is null or p.price_minor >= p_min_minor)
        and (p_max_minor is null or p.price_minor <= p_max_minor)
        and (
          -- Substring match (index-assisted by the trigram GIN indexes).
          p.name ilike v_pattern escape E'\\'
          or p.description ilike v_pattern escape E'\\'
          -- Fuzzy trigram match for typos / partial words. Plain
          -- p.description (not coalesce) keeps this arm indexable, so
          -- the whole OR becomes a BitmapOr over both trigram indexes;
          -- a NULL description simply does not match.
          or p.name % v_q
          or p.description % v_q
        )
    ),
    ranked as (
      select
        m.id,
        m.created_at,
        -- Name matches first: name-substring (0) before description-only (1).
        case when m.name ilike v_pattern escape E'\\' then 0
             else 1 end as name_first,
        greatest(
          similarity(m.name, v_q),
          similarity(coalesce(m.description, ''), v_q)
        ) as rank
      from matched m
    )
    select
      r.id,
      count(*) over () as total_count
    from ranked r
    order by
      r.name_first asc,
      r.rank desc,
      r.created_at desc,
      r.id desc
    limit v_lim
    offset v_off;
end;
$$;

revoke all on function public.search_products(
  text, uuid, integer, integer, integer, integer
) from public;
grant execute on function public.search_products(
  text, uuid, integer, integer, integer, integer
) to anon, authenticated;
