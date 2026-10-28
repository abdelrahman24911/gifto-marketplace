-- Gifto Marketplace — demo data markers
-- Adds a single boolean flag used to tag seeded demo rows so cleanup can
-- target them without touching real vendors/products. Default false keeps
-- every existing and future row non-demo unless a seed script opts in.
-- Public reads already work (table-level grants, RLS using (true)); the flag
-- is never rendered on public storefront pages, only in admin tooling and
-- cleanup scripts.

alter table public.vendors
  add column if not exists is_demo boolean not null default false;

alter table public.products
  add column if not exists is_demo boolean not null default false;
