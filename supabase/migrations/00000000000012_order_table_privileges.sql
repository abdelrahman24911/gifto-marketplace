-- Gifto Marketplace - order table least-privilege grants
--
-- Supabase's default table privileges grant ALL to anon and authenticated.
-- Migration 5 intentionally relied on RLS plus column-level grants, but it did
-- not revoke those defaults. The resulting privileges were broader than the
-- policies and allowed, for example, an authenticated vendor manager to update
-- financial columns on order_vendors directly.
--
-- Orders are written only by SECURITY DEFINER RPCs. Authenticated users need
-- read access, and vendor managers need a narrow status update. No API role
-- needs INSERT, DELETE, TRUNCATE, TRIGGER, or REFERENCES on this table group.

revoke all on table
  public.orders,
  public.order_vendors,
  public.order_items,
  public.inventory_movements
from public, anon, authenticated;

grant select on table
  public.orders,
  public.order_items,
  public.inventory_movements
to authenticated;

grant select, update (status, updated_at) on table public.order_vendors
to authenticated;
