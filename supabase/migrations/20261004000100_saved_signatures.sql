-- Saved signatures and initials (SPEC §5.7, §5.10, §8, §9, §14).
-- Images live in the private `signatures` bucket at {user_id}/{id}.png. Rows are created by the owner
-- after uploading the image; the default per kind is managed server-side.

create type public.signature_kind as enum ('signature', 'initials');
create type public.signature_method as enum ('drawn', 'typed', 'uploaded');

create table public.saved_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.signature_kind not null,
  method public.signature_method not null,
  storage_path text not null,
  typed_text text,
  font_key text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint saved_signatures_path check (storage_path = user_id::text || '/' || id::text || '.png'),
  constraint saved_signatures_typed check (
    (method = 'typed') = (typed_text is not null and font_key is not null)
  ),
  constraint saved_signatures_typed_text check (char_length(typed_text) between 1 and 100),
  constraint saved_signatures_font_key check (font_key ~ '^[a-z0-9-]{1,40}$')
);

create index saved_signatures_user_kind on public.saved_signatures (user_id, kind, created_at desc);
-- At most one default per user and kind.
create unique index saved_signatures_one_default on public.saved_signatures (user_id, kind) where is_default;

-- Maximum saved signatures per kind (enforced here, not only in the app).
create function public.saved_signatures_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialize inserts per user and kind so concurrent requests cannot exceed the limit.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.kind::text, 0));
  if (select count(*) from public.saved_signatures s where s.user_id = new.user_id and s.kind = new.kind) >= 5 then
    raise exception 'At most 5 saved % per user', new.kind using errcode = 'SF001';
  end if;
  -- The first one of a kind becomes the default.
  new.is_default := not exists (
    select 1 from public.saved_signatures s where s.user_id = new.user_id and s.kind = new.kind and s.is_default
  );
  return new;
end;
$$;

create trigger saved_signatures_before_insert
  before insert on public.saved_signatures
  for each row execute function public.saved_signatures_before_insert();

-- Deleting the default promotes the most recent remaining one of that kind.
create function public.saved_signatures_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_default then
    update public.saved_signatures s set is_default = true
    where s.id = (
      select s2.id from public.saved_signatures s2
      where s2.user_id = old.user_id and s2.kind = old.kind
      order by s2.created_at desc, s2.id
      limit 1
    );
  end if;
  return null;
end;
$$;

create trigger saved_signatures_after_delete
  after delete on public.saved_signatures
  for each row execute function public.saved_signatures_after_delete();

-- Makes one of the caller's signatures the default for its kind, in one transaction.
create function public.set_default_signature(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.signature_kind;
begin
  select s.kind into v_kind from public.saved_signatures s
  where s.id = p_id and s.user_id = (select auth.uid());
  if not found then
    raise exception 'Signature not found' using errcode = 'P0002';
  end if;
  update public.saved_signatures s set is_default = false
  where s.user_id = (select auth.uid()) and s.kind = v_kind and s.is_default and s.id <> p_id;
  update public.saved_signatures s set is_default = true where s.id = p_id;
end;
$$;

revoke execute on function public.set_default_signature(uuid) from public, anon;
grant execute on function public.set_default_signature(uuid) to authenticated, service_role;
revoke execute on function public.saved_signatures_after_delete() from public, anon, authenticated;

-- RLS: self only (SPEC §14). No client updates: the default changes through set_default_signature.
alter table public.saved_signatures enable row level security;
revoke all on public.saved_signatures from anon, authenticated;
grant select, delete on public.saved_signatures to authenticated;
grant insert (id, user_id, kind, method, storage_path, typed_text, font_key) on public.saved_signatures to authenticated;

create policy saved_signatures_select_self on public.saved_signatures
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy saved_signatures_insert_self on public.saved_signatures
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy saved_signatures_delete_self on public.saved_signatures
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Storage: private bucket, PNG only, ≤ 1 MB; owner-only access to {user_id}/{uuid}.png.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 1048576, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy signatures_select on storage.objects
  for select to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy signatures_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'signatures'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.png$'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy signatures_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text);
