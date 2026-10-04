-- Co-participant profile view, display-status logic, dashboard RPCs, recipient linking.

-- Non-sensitive profile fields of the caller and people they share a document with (SPEC §14).
-- Runs with the view owner's rights (bypasses profiles RLS); the WHERE clause is the access rule.
create view public.public_profiles
with (security_invoker = false)
as
select p.id, p.full_name, p.avatar_path
from public.profiles p
where p.id = (select auth.uid()) or public.shares_document_with(p.id);

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- Single source of truth for per-viewer display status (SPEC §6.3). Security invoker, so RLS on
-- documents decides which rows the caller sees. Hidden documents are excluded from listings.
create function public.my_documents()
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
    case
      when d.status = 'draft' then 'draft'
      when d.status = 'in_progress' and exists (
        select 1 from public.document_recipients r
        where r.document_id = d.id
          and r.user_id = (select auth.uid())
          and r.role in ('signer', 'approver')
          and r.status in ('sent', 'viewed')
          and r.signing_order = d.current_signing_order
      ) then 'needs_signature'
      when d.status = 'in_progress' then 'waiting'
      else d.status::text
    end as display_status,
    d.owner_id,
    d.updated_at,
    greatest(d.updated_at, coalesce(us.last_opened_at, d.updated_at)) as last_activity_at
  from public.documents d
  left join public.document_user_state us
    on us.document_id = d.id and us.user_id = (select auth.uid())
  where d.deleted_at is null
    and us.hidden_at is null;
$$;

create function public.get_dashboard_summary()
returns table (
  needs_signature bigint,
  waiting bigint,
  drafts bigint,
  completed bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where display_status = 'needs_signature'),
    count(*) filter (where display_status = 'waiting'),
    count(*) filter (where display_status = 'draft'),
    count(*) filter (where display_status = 'completed')
  from public.my_documents();
$$;

create function public.list_recent_documents(p_limit int default 5)
returns table (
  id uuid,
  title text,
  display_status text,
  updated_at timestamptz,
  owner_id uuid,
  owner_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.title, m.display_status, m.updated_at, m.owner_id, pp.full_name
  from public.my_documents() m
  left join public.public_profiles pp on pp.id = m.owner_id
  order by m.last_activity_at desc, m.id
  limit least(greatest(coalesce(p_limit, 5), 1), 50);
$$;

-- Link recipient rows addressed to the caller's verified email (SPEC §6.4).
create function public.link_recipients_to_user()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed_at timestamptz;
  v_count int;
begin
  if v_uid is null then
    return 0;
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmed_at
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_confirmed_at is null then
    return 0;
  end if;

  update public.document_recipients r
  set user_id = v_uid
  where r.user_id is null
    and lower(r.email::text) = lower(v_email);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.my_documents() from public, anon;
revoke execute on function public.get_dashboard_summary() from public, anon;
revoke execute on function public.list_recent_documents(int) from public, anon;
revoke execute on function public.link_recipients_to_user() from public, anon;
grant execute on function public.my_documents() to authenticated;
grant execute on function public.get_dashboard_summary() to authenticated;
grant execute on function public.list_recent_documents(int) to authenticated;
grant execute on function public.link_recipients_to_user() to authenticated;
