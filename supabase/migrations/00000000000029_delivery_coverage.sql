-- Gifto Marketplace - Phase 2: enforce vendor delivery coverage
--
-- `vendors.delivery_coverage` has been editable since Phase 1 but checkout did
-- not use it. A BEFORE INSERT trigger on `order_vendors` now checks every shop
-- in the order against the delivery address. Raising here rolls back the whole
-- checkout transaction, so direct RPC calls are covered as well as the UI.
--
-- Coverage semantics:
--   - both lists empty: the shop has not configured coverage; allow (legacy).
--   - governorates non-empty: the address governorate must match one entry.
--   - areas non-empty: the city or address line must contain one entry.
-- Matching is case-insensitive and whitespace-trimmed.

create or replace function public.delivery_coverage_allows(
  p_coverage jsonb,
  p_city text,
  p_governorate text,
  p_address_line text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_governorates text[] := array[]::text[];
  v_areas        text[] := array[]::text[];
  v_city         text := lower(btrim(coalesce(p_city, '')));
  v_governorate  text := lower(btrim(coalesce(p_governorate, '')));
  v_address      text := lower(btrim(coalesce(p_address_line, '')));
begin
  if p_coverage is null or jsonb_typeof(p_coverage) <> 'object' then
    return true;
  end if;

  if jsonb_typeof(p_coverage -> 'governorates') = 'array' then
    select coalesce(array_agg(lower(btrim(value))), array[]::text[])
      into v_governorates
      from jsonb_array_elements_text(p_coverage -> 'governorates') as value
     where btrim(value) <> '';
  end if;

  if jsonb_typeof(p_coverage -> 'areas') = 'array' then
    select coalesce(array_agg(lower(btrim(value))), array[]::text[])
      into v_areas
      from jsonb_array_elements_text(p_coverage -> 'areas') as value
     where btrim(value) <> '';
  end if;

  if cardinality(v_governorates) = 0 and cardinality(v_areas) = 0 then
    return true;
  end if;

  if cardinality(v_governorates) > 0
     and not (v_governorate = any (v_governorates)) then
    return false;
  end if;

  if cardinality(v_areas) > 0 then
    if not (v_city = any (v_areas)) then
      if not exists (
        select 1
          from unnest(v_areas) as area
         where v_address like '%' || area || '%'
      ) then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.delivery_coverage_allows(jsonb, text, text, text)
  from public, anon, authenticated;

create or replace function public.assert_order_vendor_delivery_coverage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city        text;
  v_governorate text;
  v_address     text;
  v_vendor_name text;
  v_coverage    jsonb;
begin
  select o.city, o.governorate, o.address_line
    into v_city, v_governorate, v_address
    from public.orders o
   where o.id = new.order_id;

  select v.name, v.delivery_coverage
    into v_vendor_name, v_coverage
    from public.vendors v
   where v.id = new.vendor_id;

  if not public.delivery_coverage_allows(
    v_coverage, v_city, v_governorate, v_address
  ) then
    raise exception '% does not deliver to this address.', coalesce(v_vendor_name, 'This shop')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_order_vendor_delivery_coverage()
  from public, anon, authenticated;

create trigger order_vendors_assert_delivery_coverage
  before insert on public.order_vendors
  for each row execute function public.assert_order_vendor_delivery_coverage();
