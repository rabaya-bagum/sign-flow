-- Document library RPCs (SPEC §5.2, §5.9, §5.10). All build on my_documents(), the single source
-- of per-viewer display status (SPEC §6.3), and run as the caller so RLS decides visibility.

-- Escapes LIKE wildcards in user input and wraps it for a substring match.
create function public.like_pattern(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

create function public.list_documents(
  p_bucket text default 'all',
  p_search text default null,
  p_sort text default 'newest',
  p_filters jsonb default '{}'::jsonb,
  p_cursor_value text default null,
  p_cursor_id uuid default null,
  p_limit int default 20
)
returns table (
  id uuid,
  title text,
  display_status text,
  status public.document_status,
  created_at timestamptz,
  updated_at timestamptz,
  file_size_bytes bigint,
  page_count int,
  owner_id uuid,
  owner_name text,
  participants jsonb,
  participant_count int,
  signers_total int,
  signers_completed int,
  upload_incomplete boolean,
  cursor_value text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_pattern text := case when v_search is null then null else public.like_pattern(v_search) end;
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_recipient text := nullif(trim(coalesce(v_filters ->> 'recipient', '')), '');
  v_recipient_pattern text := case when v_recipient is null then null else public.like_pattern(v_recipient) end;
begin
  if p_sort not in ('newest', 'oldest', 'title') then
    raise exception 'invalid sort %', p_sort using errcode = '22023';
  end if;
  if p_bucket not in ('all', 'needs_signature', 'waiting', 'draft', 'completed', 'closed') then
    raise exception 'invalid bucket %', p_bucket using errcode = '22023';
  end if;

  return query
  with base as (
    select
      m.id,
      m.title,
      m.display_status,
      d.status,
      d.created_at,
      d.updated_at,
      d.file_size_bytes,
      d.page_count,
      d.owner_id,
      d.original_path is null as upload_incomplete,
      -- Keyset sort key: ISO UTC timestamps sort lexically in time order.
      case when p_sort = 'title' then lower(m.title)
           else to_char(d.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') end as sort_value
    from public.my_documents() m
    join public.documents d on d.id = m.id
    where (
        p_bucket = 'all'
        or (p_bucket = 'closed' and m.display_status in ('declined', 'voided', 'expired'))
        or m.display_status = p_bucket
      )
      and (
        v_pattern is null
        or m.title ilike v_pattern
        or exists (
          select 1 from public.document_recipients r
          where r.document_id = d.id and (r.name ilike v_pattern or r.email::text ilike v_pattern)
        )
      )
      and (v_filters ->> 'created_from' is null or d.created_at >= (v_filters ->> 'created_from')::timestamptz)
      and (v_filters ->> 'created_to' is null or d.created_at < (v_filters ->> 'created_to')::timestamptz)
      and (v_filters ->> 'modified_from' is null or d.updated_at >= (v_filters ->> 'modified_from')::timestamptz)
      and (v_filters ->> 'modified_to' is null or d.updated_at < (v_filters ->> 'modified_to')::timestamptz)
      and (v_filters ->> 'sender_id' is null or d.owner_id = (v_filters ->> 'sender_id')::uuid)
      and (
        v_recipient_pattern is null
        or exists (
          select 1 from public.document_recipients r
          where r.document_id = d.id
            and (r.name ilike v_recipient_pattern or r.email::text ilike v_recipient_pattern)
        )
      )
  )
  select
    b.id,
    b.title,
    b.display_status,
    b.status,
    b.created_at,
    b.updated_at,
    b.file_size_bytes,
    b.page_count,
    b.owner_id,
    pp.full_name,
    coalesce(p.participants, '[]'::jsonb),
    coalesce(p.participant_count, 0),
    coalesce(p.signers_total, 0),
    coalesce(p.signers_completed, 0),
    b.upload_incomplete,
    b.sort_value
  from base b
  left join public.public_profiles pp on pp.id = b.owner_id
  left join lateral (
    select
      jsonb_agg(jsonb_build_object('name', x.name, 'email', x.email) order by x.rn) filter (where x.rn <= 3) as participants,
      count(*)::int as participant_count,
      (count(*) filter (where x.role in ('signer', 'approver')))::int as signers_total,
      (count(*) filter (where x.status in ('signed', 'approved')))::int as signers_completed
    from (
      select r.name, r.email::text as email, r.role, r.status,
             row_number() over (order by r.signing_order, r.created_at, r.id) as rn
      from public.document_recipients r
      where r.document_id = b.id
    ) x
  ) p on true
  where p_cursor_id is null
     or (p_sort = 'newest' and (b.sort_value, b.id) < (p_cursor_value, p_cursor_id))
     or (p_sort <> 'newest' and (b.sort_value, b.id) > (p_cursor_value, p_cursor_id))
  order by
    case when p_sort = 'newest' then b.sort_value end desc,
    case when p_sort = 'newest' then b.id end desc,
    case when p_sort <> 'newest' then b.sort_value end asc,
    case when p_sort <> 'newest' then b.id end asc
  limit v_limit;
end;
$$;

create function public.search_documents(p_query text)
returns table (
  id uuid,
  title text,
  display_status text,
  updated_at timestamptz,
  matched_recipient_name text,
  matched_recipient_email text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select public.like_pattern(trim(p_query)) as pat
    where length(trim(coalesce(p_query, ''))) >= 2
  )
  select m.id, m.title, m.display_status, m.updated_at, rr.name, rr.email
  from public.my_documents() m
  cross join q
  left join lateral (
    select r.name, r.email::text as email
    from public.document_recipients r
    where r.document_id = m.id and (r.name ilike q.pat or r.email::text ilike q.pat)
    order by r.signing_order, r.created_at
    limit 1
  ) rr on true
  where m.title ilike q.pat or rr.name is not null
  order by (m.title ilike q.pat) desc, m.updated_at desc, m.id
  limit 20;
$$;

create function public.get_storage_usage()
returns table (bytes bigint, document_count int)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(d.file_size_bytes), 0)::bigint, count(*)::int
  from public.documents d
  where d.owner_id = (select auth.uid()) and d.deleted_at is null;
$$;

create function public.list_document_senders()
returns table (id uuid, full_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct m.owner_id, coalesce(pp.full_name, '')
  from public.my_documents() m
  left join public.public_profiles pp on pp.id = m.owner_id
  order by 2, 1;
$$;

revoke execute on function public.list_documents(text, text, text, jsonb, text, uuid, int) from public, anon;
revoke execute on function public.search_documents(text) from public, anon;
revoke execute on function public.get_storage_usage() from public, anon;
revoke execute on function public.list_document_senders() from public, anon;
grant execute on function public.list_documents(text, text, text, jsonb, text, uuid, int) to authenticated;
grant execute on function public.search_documents(text) to authenticated;
grant execute on function public.get_storage_usage() to authenticated;
grant execute on function public.list_document_senders() to authenticated;
