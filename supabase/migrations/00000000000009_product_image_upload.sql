-- Gifto Marketplace — product image upload (Storage)
-- Creates the public-read `product-images` bucket and locks writes to the
-- owning shop's managers. Object paths are `{vendor_id}/{product_id}/{uuid}.{ext}`;
-- the policies verify both path segments, so a manager of shop A can never
-- write into shop B's folder even if they guess a product id. `objects.name`
-- is qualified because `products` also has a `name` column, and an
-- unqualified reference inside the EXISTS subquery would bind to that one.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

-- Public read: the bucket is public, and catalog pages build
-- /storage/v1/object/public/product-images/{path} URLs directly.
-- drop-if-exists keeps the migration re-runnable in the local container
-- workflow, where storage survives the per-suite `drop schema public`.
drop policy if exists "product images: public read" on storage.objects;
create policy "product images: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

-- Upload: authenticated owners/managers of the vendor that owns the product
-- named by the second path segment, and only inside that vendor's folder.
drop policy if exists "product images: manager upload" on storage.objects;
create policy "product images: manager upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.products p
      where p.id::text = (storage.foldername(objects.name))[2]
        and p.vendor_id::text = (storage.foldername(objects.name))[1]
        and public.is_vendor_manager(p.vendor_id)
    )
  );

-- Delete: same ownership rule as upload (removing an image from the gallery).
drop policy if exists "product images: manager delete" on storage.objects;
create policy "product images: manager delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.products p
      where p.id::text = (storage.foldername(objects.name))[2]
        and p.vendor_id::text = (storage.foldername(objects.name))[1]
        and public.is_vendor_manager(p.vendor_id)
    )
  );
