-- Gifto Marketplace — Phase 7: logged manual stock adjustments
--
-- Stock is no longer edited through the product form after creation. Instead,
-- every manual change goes through `adjust_product_stock`, which is the only way
-- to write `products.stock` by hand, and which records an `inventory_movements`
-- row (reason `manual_adjustment`) with an optional note so the history explains
-- itself. `orders`/`cancel_order` continue to move stock through their own
-- triggers; this migration does not touch them.

-- A short human reason for a manual adjustment (e.g. "damaged", "restock").
alter table public.inventory_movements
  add column note text check (note is null or length(note) <= 280);

-- ---------------------------------------------------------------------------
-- adjust_product_stock — the single, audited door for manual stock changes
--
-- Only owners/managers of the product's shop (or a platform admin) may call it.
-- The product row is locked so concurrent adjustments cannot lose an update.
-- ---------------------------------------------------------------------------

create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_delta integer,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id uuid;
  v_stock     integer;
  v_new       integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to adjust stock.' using errcode = '42501';
  end if;

  if p_product_id is null then
    raise exception 'Choose a product.' using errcode = '22023';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'Enter a non-zero adjustment.' using errcode = '22023';
  end if;

  if abs(p_delta) > 1000000 then
    raise exception 'That adjustment is too large.' using errcode = '22023';
  end if;

  if p_note is not null and length(p_note) > 280 then
    raise exception 'A note must be 280 characters or fewer.' using errcode = '22023';
  end if;

  select vendor_id, stock
    into v_vendor_id, v_stock
    from public.products
   where id = p_product_id
     for update;

  if v_vendor_id is null then
    raise exception 'Product not found.' using errcode = '42501';
  end if;

  if not (public.is_vendor_manager(v_vendor_id) or public.is_platform_admin()) then
    raise exception 'Only shop owners and managers can adjust stock.'
      using errcode = '42501';
  end if;

  v_new := v_stock + p_delta;

  if v_new < 0 then
    raise exception 'Stock cannot go below zero.' using errcode = '23514';
  end if;

  if v_new > 1000000 then
    raise exception 'Stock cannot exceed 1000000.' using errcode = '23514';
  end if;

  update public.products set stock = v_new where id = p_product_id;

  insert into public.inventory_movements (product_id, delta, reason, note, created_by)
  values (
    p_product_id,
    p_delta,
    'manual_adjustment',
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid()
  );

  return v_new;
end;
$$;

revoke all on function public.adjust_product_stock(uuid, integer, text)
  from public, anon;
grant execute on function public.adjust_product_stock(uuid, integer, text)
  to authenticated;
