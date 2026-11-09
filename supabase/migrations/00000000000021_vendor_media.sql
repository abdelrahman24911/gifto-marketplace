-- Gifto Marketplace - dedicated vendor media bucket
--
-- Vendor branding must not reuse the product-images bucket. Product images are
-- namespaced by product and governed by product ownership; vendor logos and
-- covers are namespaced by vendor and governed by vendor membership.
--
-- Objects live at:
--   {vendor_id}/branding/logo-{uuid}.{ext}
--   {vendor_id}/cover/cover-{uuid}.{ext}
--
-- The bucket is public-read like the storefront catalog. Writes are restricted
-- to active owners/managers of the vendor named by the first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-media',
  'vendor-media',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

drop policy if exists "vendor media: public read" on storage.objects;
create policy "vendor media: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'vendor-media');

drop policy if exists "vendor media: manager upload" on storage.objects;
create policy "vendor media: manager upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vendor-media'
    and (storage.foldername(objects.name))[2] in ('branding', 'cover')
    and case
      when (storage.foldername(objects.name))[1]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_vendor_manager(((storage.foldername(objects.name))[1])::uuid)
      else false
    end
  );

drop policy if exists "vendor media: manager update" on storage.objects;
create policy "vendor media: manager update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'vendor-media'
    and (storage.foldername(objects.name))[2] in ('branding', 'cover')
    and case
      when (storage.foldername(objects.name))[1]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_vendor_manager(((storage.foldername(objects.name))[1])::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'vendor-media'
    and (storage.foldername(objects.name))[2] in ('branding', 'cover')
    and case
      when (storage.foldername(objects.name))[1]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_vendor_manager(((storage.foldername(objects.name))[1])::uuid)
      else false
    end
  );

drop policy if exists "vendor media: manager delete" on storage.objects;
create policy "vendor media: manager delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vendor-media'
    and (storage.foldername(objects.name))[2] in ('branding', 'cover')
    and case
      when (storage.foldername(objects.name))[1]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_vendor_manager(((storage.foldername(objects.name))[1])::uuid)
      else false
    end
  );
