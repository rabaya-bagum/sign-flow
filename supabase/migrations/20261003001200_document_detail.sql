-- Single-document read for the details screen, sharing the display-status rule with my_documents().

-- Per-viewer display status (SPEC §6.3). The one place this rule lives.
create function public.document_display_status(
  p_document_id uuid,
  p_status public.document_status,
  p_current_signing_order int
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_status = 'draft' then 'draft'
    when p_status = 'in_progress' and exists (
      select 1 from public.document_recipients r
      where r.document_id = p_document_id
        and r.user_id = (select auth.uid())
        and r.role in ('signer', 'approver')
        and r.status in ('sent', 'viewed')
        and r.signing_order = p_current_signing_order
    ) then 'needs_signature'
    when p_status = 'in_progress' then 'waiting'
    else p_status::text
  end;
$$;

create or replace function public.my_documents()
returns table (
  id uuid,
  title text,
  status public.document_status,
  display_status text,
  owner_id uuid,
  updated_at timestamptz,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.id,
    d.title,
    d.status,
    public.document_display_status(d.id, d.status, d.current_signing_order),
    d.owner_id,
    d.updated_at,
    greatest(d.updated_at, coalesce(us.last_opened_at, d.updated_at))
  from public.documents d
  left join public.document_user_state us
    on us.document_id = d.id and us.user_id = (select auth.uid())
  where d.deleted_at is null
    and us.hidden_at is null;
$$;

-- Works for hidden documents too (SPEC §6.2: hidden documents stay reachable by direct link).
create function public.get_document(p_document_id uuid)
returns table (
  id uuid,
  title text,
  display_status text,
  status public.document_status,
  owner_id uuid,
  owner_name text,
  is_owner boolean,
  created_at timestamptz,
  updated_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  file_size_bytes bigint,
  page_count int,
  upload_incomplete boolean,
  hidden boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.id,
    d.title,
    public.document_display_status(d.id, d.status, d.current_signing_order),
    d.status,
    d.owner_id,
    pp.full_name,
    d.owner_id = (select auth.uid()),
    d.created_at,
    d.updated_at,
    d.sent_at,
    d.completed_at,
    d.voided_at,
    d.void_reason,
    d.file_size_bytes,
    d.page_count,
    d.original_path is null,
    us.hidden_at is not null
  from public.documents d
  left join public.public_profiles pp on pp.id = d.owner_id
  left join public.document_user_state us on us.document_id = d.id and us.user_id = (select auth.uid())
  where d.id = p_document_id;
$$;

revoke execute on function public.document_display_status(uuid, public.document_status, int) from public, anon;
revoke execute on function public.get_document(uuid) from public, anon;
grant execute on function public.document_display_status(uuid, public.document_status, int) to authenticated;
grant execute on function public.get_document(uuid) to authenticated;
