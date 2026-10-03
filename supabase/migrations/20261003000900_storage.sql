-- Private storage buckets and policies (SPEC §9). Clients never read `documents` directly:
-- downloads go through the get-download-url Edge Function (short-lived signed URLs).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 26214400, array['application/pdf']),
  ('uploads-tmp', 'uploads-tmp', false, 10485760, array['image/jpeg', 'image/png']),
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the caller may upload this document's original: their own non-deleted draft that has
-- no processed file yet.
create function public.can_upload_original(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and d.owner_id = (select auth.uid())
      and d.status = 'draft'
      and d.deleted_at is null
      and d.original_path is null
  );
$$;

revoke execute on function public.can_upload_original(uuid) from public, anon;
grant execute on function public.can_upload_original(uuid) to authenticated, service_role;

-- documents: insert-only, exactly {owner_id}/{document_id}/original.pdf.
create policy documents_insert_original on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/original\.pdf$'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_upload_original(((storage.foldername(name))[2])::uuid)
  );

-- uploads-tmp: the owner manages files in their own folder (images awaiting conversion).
create policy uploads_tmp_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads-tmp' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy uploads_tmp_select on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads-tmp' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy uploads_tmp_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads-tmp' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- avatars: one file per user; readable by signed-in users (served via signed URLs).
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');

create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');
