-- Rollback for 00000000000015_active_vendor_hardening.sql.
--
-- This restores the pre-15 policies/grants. It is intentionally a separate,
-- explicit operation: rolling back removes the active-only protections and the
-- audited stock write restriction, so review the security impact first.

create or replace function public.is_order_shop_member(p_order_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.order_vendors ov
    where ov.order_id = p_order_id and public.is_vendor_member(ov.vendor_id)
  );
$$;

revoke all on function public.is_order_shop_member(uuid) from public, anon;
grant execute on function public.is_order_shop_member(uuid) to authenticated;

drop policy if exists "vendors: owner update own" on public.vendors;
create policy "vendors: owner update own"
  on public.vendors for update
  using (public.is_vendor_owner(id))
  with check (public.is_vendor_owner(id));

drop policy if exists "vendor_members: owner manage" on public.vendor_members;
create policy "vendor_members: owner manage"
  on public.vendor_members for insert
  with check (public.is_vendor_owner(vendor_id) or public.is_platform_admin());

drop policy if exists "vendor_members: owner update" on public.vendor_members;
create policy "vendor_members: owner update"
  on public.vendor_members for update
  using (public.is_vendor_owner(vendor_id) or public.is_platform_admin())
  with check (public.is_vendor_owner(vendor_id) or public.is_platform_admin());

drop policy if exists "vendor_members: owner delete" on public.vendor_members;
create policy "vendor_members: owner delete"
  on public.vendor_members for delete
  using (public.is_vendor_owner(vendor_id) or public.is_platform_admin());

drop policy if exists "products: owner delete" on public.products;
create policy "products: owner delete"
  on public.products for delete
  using (public.is_vendor_owner(vendor_id) or public.is_platform_admin());

drop policy if exists "product_images: owner delete" on public.product_images;
create policy "product_images: owner delete"
  on public.product_images for delete
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (public.is_vendor_owner(p.vendor_id) or public.is_platform_admin())
    )
  );

revoke update (name, description, price_minor, category_id, status, updated_at)
  on table public.products
from authenticated;
grant update on table public.products to authenticated;

drop policy if exists "order_vendors: vendor read" on public.order_vendors;
create policy "order_vendors: vendor read"
  on public.order_vendors for select
  using (public.is_vendor_member(vendor_id));

drop policy if exists "order_items: vendor read" on public.order_items;
create policy "order_items: vendor read"
  on public.order_items for select
  using (
    exists (
      select 1
      from public.order_vendors ov
      where ov.id = order_vendor_id and public.is_vendor_member(ov.vendor_id)
    )
  );

drop policy if exists "inventory_movements: vendor read" on public.inventory_movements;
create policy "inventory_movements: vendor read"
  on public.inventory_movements for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and public.is_vendor_member(p.vendor_id)
    )
  );

drop policy if exists "commission_entries: vendor read" on public.commission_entries;
create policy "commission_entries: vendor read"
  on public.commission_entries for select
  using (public.is_vendor_member(vendor_id));

drop policy if exists "settlements: vendor read" on public.settlements;
create policy "settlements: vendor read"
  on public.settlements for select
  using (public.is_vendor_member(vendor_id));

drop policy if exists "settlement_lines: vendor read" on public.settlement_lines;
create policy "settlement_lines: vendor read"
  on public.settlement_lines for select
  using (
    exists (
      select 1 from public.settlements s
      where s.id = settlement_id and public.is_vendor_member(s.vendor_id)
    )
  );

drop index if exists public.vendors_contact_email_normalized_key;

drop function if exists public.create_vendor_for_owner(
  text, text, text, text, text, text, numeric, uuid
);

drop function if exists public.is_vendor_active_member(uuid);
drop function if exists public.is_vendor_active_owner(uuid);
