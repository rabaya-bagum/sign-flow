-- Two-factor authentication (SPEC §5.10 Security, TOTP). Once a user has a verified factor, every
-- request must come from a session that passed it (JWT aal = 'aal2'). Enforced here, not only in the
-- app: a restrictive policy on every table and bucket the app reaches, a check in the definer helpers
-- that bypass RLS, and the same check in every Edge Function (requestContext).

create function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      );
$$;
revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated, service_role;

create policy profiles_mfa on public.profiles as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy documents_mfa on public.documents as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy document_recipients_mfa on public.document_recipients as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy document_events_mfa on public.document_events as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy document_user_state_mfa on public.document_user_state as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy document_pages_mfa on public.document_pages as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy saved_signatures_mfa on public.saved_signatures as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy document_fields_mfa on public.document_fields as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy field_values_mfa on public.field_values as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy notifications_mfa on public.notifications as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
create policy push_tokens_mfa on public.push_tokens as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());

create policy objects_mfa on storage.objects as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());

-- Definer functions skip RLS, so they check too.
create or replace function public.shares_document_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mfa_satisfied() and exists (
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

create or replace function public.set_default_signature(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.signature_kind;
begin
  if not public.mfa_satisfied() then
    raise exception 'Two-factor verification required' using errcode = '42501';
  end if;
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
