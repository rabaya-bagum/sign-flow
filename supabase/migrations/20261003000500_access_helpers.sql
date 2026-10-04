-- Authorization helpers used by every policy (SPEC §14). Security definer so policies on
-- documents can consult recipients (and vice versa) without recursive RLS evaluation.
--
-- "Active participant": a recipient linked to the caller whose status is not 'pending', on a
-- non-draft, non-deleted document. Status leaves 'pending' when the recipient's signing group
-- is activated (or, for CC, at completion), so this covers active/past groups, CC-after-completion
-- and terminal states with a single rule.

create function public.is_document_owner(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and d.owner_id = (select auth.uid())
      and d.deleted_at is null
  );
$$;

create function public.is_draft_owner(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and d.owner_id = (select auth.uid())
      and d.status = 'draft'
      and d.deleted_at is null
  );
$$;

create function public.is_active_participant(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.document_recipients r
    join public.documents d on d.id = r.document_id
    where r.document_id = p_document_id
      and r.user_id = (select auth.uid())
      and r.status <> 'pending'
      and d.status <> 'draft'
      and d.deleted_at is null
  );
$$;

-- True when the caller and p_profile_id are both involved in a document the caller can access.
create function public.shares_document_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.deleted_at is null
      and (
        d.owner_id = (select auth.uid())
        or exists (
          select 1 from public.document_recipients me
          where me.document_id = d.id
            and me.user_id = (select auth.uid())
            and me.status <> 'pending'
            and d.status <> 'draft'
        )
      )
      and (
        d.owner_id = p_profile_id
        or exists (
          select 1 from public.document_recipients them
          where them.document_id = d.id and them.user_id = p_profile_id
        )
      )
  );
$$;

revoke execute on function public.is_document_owner(uuid) from public, anon;
revoke execute on function public.is_draft_owner(uuid) from public, anon;
revoke execute on function public.is_active_participant(uuid) from public, anon;
revoke execute on function public.shares_document_with(uuid) from public, anon;
grant execute on function public.is_document_owner(uuid) to authenticated, service_role;
grant execute on function public.is_draft_owner(uuid) to authenticated, service_role;
grant execute on function public.is_active_participant(uuid) to authenticated, service_role;
grant execute on function public.shares_document_with(uuid) to authenticated, service_role;
