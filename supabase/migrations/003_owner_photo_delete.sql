-- The person who created a pandal can delete any photo on it, including ones
-- they did not upload. The uploader can still delete their own photo.
-- Direct deletes stay off storage_cleanup; the client removes the object.

drop policy if exists photos_delete_own on public.photos;
create policy photos_delete_own on public.photos for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.pandals
      where id = pandal_id
        and created_by = (select auth.uid())
    )
  );

do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    drop policy if exists "pandal photos: delete own" on storage.objects;
    create policy "pandal photos: delete own" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'pandal-photos'
        and (
          (storage.foldername(name))[1] = (select auth.uid())::text
          or exists (
            select 1 from public.pandals
            where id::text = (storage.foldername(name))[2]
              and created_by = (select auth.uid())
          )
        )
      );
  end if;
end $$;
