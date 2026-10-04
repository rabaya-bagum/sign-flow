-- Field definitions placed in the editor (SPEC §5.6, §8, §8.1). Geometry is fractions of the displayed
-- page (top-left origin); shared/geometry.ts converts to PDF points. Values arrive in Phase 6.

create type public.field_type as enum (
  'signature', 'initials', 'full_name', 'email', 'date_signed', 'text', 'checkbox', 'radio', 'dropdown', 'stamp'
);

-- Placeholder recipients (Phase 4): a draft may have recipients without an email yet ("Signer 2").
-- send-document (Phase 5) refuses to send while any recipient lacks an email.
alter table public.document_recipients alter column email drop not null;

create table public.document_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  recipient_id uuid not null references public.document_recipients (id) on delete cascade,
  page_number int not null check (page_number >= 1),
  type public.field_type not null,
  x numeric not null check (x >= 0 and x <= 1),
  y numeric not null check (y >= 0 and y <= 1),
  width numeric not null check (width > 0 and x + width <= 1.000001),
  height numeric not null check (height > 0 and y + height <= 1.000001),
  required boolean not null default true,
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_fields_document_recipient_idx on public.document_fields (document_id, recipient_id);
create index document_fields_document_page_idx on public.document_fields (document_id, page_number);

create trigger document_fields_set_updated_at
  before update on public.document_fields
  for each row execute function public.set_updated_at();

-- A field's recipient belongs to the same document, and its page exists.
create function public.document_fields_check_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.document_recipients r where r.id = new.recipient_id and r.document_id = new.document_id
  ) then
    raise exception 'recipient does not belong to this document' using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.document_pages p where p.document_id = new.document_id and p.page_number = new.page_number
  ) then
    raise exception 'page % does not exist', new.page_number using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger document_fields_check_refs
  before insert or update on public.document_fields
  for each row execute function public.document_fields_check_refs();

revoke execute on function public.document_fields_check_refs() from public, anon, authenticated;

alter table public.document_fields enable row level security;
revoke all on public.document_fields from anon, authenticated;
grant select on public.document_fields to authenticated;
grant insert (id, document_id, recipient_id, page_number, type, x, y, width, height, required, properties)
  on public.document_fields to authenticated;
grant update (recipient_id, page_number, x, y, width, height, required, properties)
  on public.document_fields to authenticated;
grant delete on public.document_fields to authenticated;

-- Owner sees all fields; an active participant sees their own fields. (Other people's filled fields
-- become visible with field_values in Phase 6.)
create policy document_fields_select on public.document_fields
  for select to authenticated
  using (
    public.is_document_owner(document_id)
    or (
      public.is_active_participant(document_id)
      and exists (
        select 1 from public.document_recipients r
        where r.id = recipient_id and r.user_id = (select auth.uid())
      )
    )
  );

create policy document_fields_insert_draft_owner on public.document_fields
  for insert to authenticated
  with check (public.is_draft_owner(document_id));

create policy document_fields_update_draft_owner on public.document_fields
  for update to authenticated
  using (public.is_draft_owner(document_id))
  with check (public.is_draft_owner(document_id));

create policy document_fields_delete_draft_owner on public.document_fields
  for delete to authenticated
  using (public.is_draft_owner(document_id));

-- Autosave: replaces the document's whole field set in one transaction (RLS applies: invoker).
-- p_fields: [{ id, recipient_id, page_number, type, x, y, width, height, required, properties }]
create function public.save_document_fields(p_document_id uuid, p_fields jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_draft_owner(p_document_id) then
    raise exception 'Only the owner can edit fields of a draft' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 500 then
    raise exception 'p_fields must be an array of at most 500 fields' using errcode = '22023';
  end if;

  delete from public.document_fields f
  where f.document_id = p_document_id
    and f.id not in (select (e->>'id')::uuid from jsonb_array_elements(p_fields) e);

  insert into public.document_fields as f
    (id, document_id, recipient_id, page_number, type, x, y, width, height, required, properties)
  select (e->>'id')::uuid, p_document_id, (e->>'recipient_id')::uuid, (e->>'page_number')::int,
         (e->>'type')::public.field_type, (e->>'x')::numeric, (e->>'y')::numeric,
         (e->>'width')::numeric, (e->>'height')::numeric, coalesce((e->>'required')::boolean, true),
         coalesce(e->'properties', '{}'::jsonb)
  from jsonb_array_elements(p_fields) e
  on conflict (id) do update
    set recipient_id = excluded.recipient_id,
        page_number = excluded.page_number,
        x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height,
        required = excluded.required,
        properties = excluded.properties
    where f.document_id = p_document_id
      and (f.recipient_id, f.page_number, f.x, f.y, f.width, f.height, f.required, f.properties)
          is distinct from
          (excluded.recipient_id, excluded.page_number, excluded.x, excluded.y, excluded.width,
           excluded.height, excluded.required, excluded.properties);

  select count(*) into v_count from public.document_fields f where f.document_id = p_document_id;
  return v_count;
end;
$$;

revoke execute on function public.save_document_fields(uuid, jsonb) from public, anon;
grant execute on function public.save_document_fields(uuid, jsonb) to authenticated;
