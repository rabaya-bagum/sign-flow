-- Account deletion (SPEC §17.3, §5.10). The delete-account Edge Function re-authenticates the caller,
-- voids their documents still in progress, calls delete_account_data() below, removes the storage
-- objects it returns and finally soft-deletes the auth user (Supabase obfuscates the email, removes
-- identities and revokes every session).
--
-- The profile row stays as a tombstone because documents and the append-only audit log reference it.
-- It keeps only full_name and email, which other participants' retained records show (the sender of a
-- completed document); phone, photo and preferences are cleared.

alter table public.profiles add column deleted_at timestamptz;

-- Supabase replaces the email of a soft-deleted auth user with a hash; the tombstone keeps the real one.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

-- Removes everything that belongs only to p_user_id. Returns the storage objects the caller must remove:
--   { "documents": [soft-deleted document ids], "objects": [{ "bucket": text, "name": text }] }
-- Owned drafts, and owned documents nobody else takes part in, are soft-deleted (their files go).
-- Documents involving other people stay for them (SPEC §17.2); the caller voids those still in progress
-- before calling this. Recipient rows linked to the account are unlinked: their name and email stay on
-- the document as the legal record.
create function public.delete_account_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_documents uuid[];
  v_objects jsonb;
begin
  select * into v_profile from public.profiles p where p.id = p_user_id for update;
  if not found or v_profile.deleted_at is not null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.documents d
    where d.owner_id = p_user_id and d.status = 'in_progress' and d.deleted_at is null
  ) then
    raise exception 'Void documents in progress first' using errcode = 'SF031';
  end if;

  with gone as (
    update public.documents d
    set deleted_at = now()
    where d.owner_id = p_user_id
      and d.deleted_at is null
      and (
        d.status = 'draft'
        or not exists (
          select 1 from public.document_recipients r
          where r.document_id = d.id
            and r.user_id is distinct from p_user_id
            and lower(r.email::text) <> lower(v_profile.email)
        )
      )
    returning d.id
  )
  select coalesce(array_agg(id), '{}') into v_documents from gone;

  delete from public.saved_signatures where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.document_user_state where user_id = p_user_id;
  update public.document_recipients set user_id = null where user_id = p_user_id;

  update public.profiles
  set deleted_at = now(),
      phone = null,
      avatar_path = null,
      notification_prefs = '{}'::jsonb
  where id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)), '[]'::jsonb)
  into v_objects
  from storage.objects o
  where (o.bucket_id in ('signatures', 'uploads-tmp', 'avatars') and o.name like p_user_id::text || '/%')
     or (o.bucket_id = 'documents' and split_part(o.name, '/', 1) = p_user_id::text
         and split_part(o.name, '/', 2) = any (v_documents::text[]));

  return jsonb_build_object('documents', to_jsonb(v_documents), 'objects', v_objects);
end;
$$;

revoke execute on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
