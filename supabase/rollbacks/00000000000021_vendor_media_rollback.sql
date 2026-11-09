-- Rollback for 00000000000021_vendor_media.sql.
--
-- Removes the vendor-media bucket and its storage policies. Existing objects
-- are deliberately not deleted: the bucket delete is refused while any object
-- still lives under it. Copy/export those objects first. The application must
-- also be running the pre-21 single-bucket logo/cover code before this is run.
--
-- If migration 22 or a later dashboard migration is applied, roll those back
-- first so the media bucket is no longer referenced by active code.

do $$
begin
  if exists (
    select 1
      from storage.objects
     where bucket_id = 'vendor-media'
  ) then
    raise exception 'Refusing to roll back 21: vendor-media objects still exist. Copy/export them first.';
  end if;
end $$;

drop policy if exists "vendor media: manager delete" on storage.objects;
drop policy if exists "vendor media: manager update" on storage.objects;
drop policy if exists "vendor media: manager upload" on storage.objects;
drop policy if exists "vendor media: public read" on storage.objects;

delete from storage.buckets where id = 'vendor-media';
