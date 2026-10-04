-- Signing and completion (SPEC §5.5, §5.12, §6.2, §7, §10, §12, §17.1).
-- Every state change runs in a service-role, security-definer function that locks the document row,
-- so concurrent submissions serialize and the "last signer finalizes" decision is made exactly once.
-- Edge Functions call these after validating the request (token or session) and the values.

-- Values ---------------------------------------------------------------------------------------------
-- Written only by complete_recipient(); immutable afterwards (no client write grants, no updates).
create table public.field_values (
  field_id uuid primary key references public.document_fields (id) on delete cascade,
  -- Denormalized so this table's policy never reads document_fields (whose policy reads this table).
  document_id uuid not null references public.documents (id) on delete cascade,
  recipient_id uuid not null references public.document_recipients (id) on delete cascade,
  value text check (length(value) <= 2000),
  asset_path text,
  filled_at timestamptz not null default now()
);
create index field_values_recipient_idx on public.field_values (recipient_id);

alter table public.field_values enable row level security;
revoke all on public.field_values from anon, authenticated;
grant select on public.field_values to authenticated;

create policy field_values_select on public.field_values
  for select to authenticated
  using (public.is_document_owner(document_id) or public.is_active_participant(document_id));

-- An active participant now also sees other people's fields once they have a value (SPEC §14).
drop policy document_fields_select on public.document_fields;
create policy document_fields_select on public.document_fields
  for select to authenticated
  using (
    public.is_document_owner(document_id)
    or (
      public.is_active_participant(document_id)
      and (
        exists (
          select 1 from public.document_recipients r
          where r.id = recipient_id and r.user_id = (select auth.uid())
        )
        or exists (select 1 from public.field_values v where v.field_id = document_fields.id)
      )
    )
  );

-- Guest access: OTP, consent, token purpose ----------------------------------------------------------
create table public.recipient_otps (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.document_recipients (id) on delete cascade,
  otp_hash text not null check (otp_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempts int not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index recipient_otps_recipient_idx on public.recipient_otps (recipient_id, created_at desc);

create table public.esign_consents (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.document_recipients (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  disclosure_version text not null,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text
);
create index esign_consents_recipient_idx on public.esign_consents (recipient_id);

alter table public.recipient_otps enable row level security;
alter table public.esign_consents enable row level security;
revoke all on public.recipient_otps, public.esign_consents from anon, authenticated;

-- 'sign' tokens open the signing flow; 'download' tokens (issued at completion) only fetch the
-- completed files. otp_verified_at: this link passed the email code check (require_email_otp).
alter table public.recipient_access_tokens
  add column purpose text not null default 'sign' check (purpose in ('sign', 'download')),
  add column otp_verified_at timestamptz;

-- Signature images are stored next to the document: documents/{owner}/{doc}/signing/{recipient}/{field}.png
-- (service role only; the client upload policy still allows nothing but original.pdf).
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/png'] where id = 'documents';

-- State changes --------------------------------------------------------------------------------------

-- First open by an active recipient: sent → viewed. Never changes any other status.
create function public.mark_recipient_viewed(p_recipient_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.document_recipients r
    set status = 'viewed', viewed_at = now()
    where r.id = p_recipient_id and r.status = 'sent'
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- Activates the next signing group (and any viewer-only groups after it, which never block). Returns
-- the newly activated recipients; an empty result with no remaining groups means "finalize".
create function public.activate_next_group(p_document_id uuid)
returns table (recipient_id uuid, name text, email text, user_id uuid, role public.recipient_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current int;
  v_next int;
begin
  select d.current_signing_order into v_current from public.documents d where d.id = p_document_id;
  loop
    select min(r.signing_order) into v_next
    from public.document_recipients r
    where r.document_id = p_document_id and r.role <> 'cc' and r.signing_order > v_current;
    exit when v_next is null;

    update public.documents d set current_signing_order = v_next where d.id = p_document_id;
    return query
    update public.document_recipients r
    set status = 'sent', sent_at = now()
    where r.document_id = p_document_id and r.signing_order = v_next and r.role <> 'cc'
      and r.status = 'pending'
    returning r.id, r.name, r.email::text, r.user_id, r.role;

    -- Stop at the first group that has someone who must act.
    exit when exists (
      select 1 from public.document_recipients r
      where r.document_id = p_document_id and r.signing_order = v_next and r.role in ('signer', 'approver')
    );
    v_current := v_next;
  end loop;
end;
$$;

-- Records a signer's values (or an approver's approval) and advances the document, in one transaction.
-- p_values: [{ "field_id": uuid, "value": text|null, "asset_path": text|null }]. The Edge Function has
-- already validated value formats with shared/signing.ts; this re-checks ownership, completeness and
-- the turn. Returns { outcome: 'waiting' | 'advanced' | 'finalize', activated: [...] }.
-- Errors: P0002 unknown recipient; SF030 not your turn / already acted; SF031 document not in
-- progress; SF032 invalid values.
create function public.complete_recipient(p_recipient_id uuid, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.document_recipients;
  v_doc public.documents;
  v_activated jsonb;
  v_missing int;
begin
  select * into v_rec from public.document_recipients r where r.id = p_recipient_id;
  if not found then
    raise exception 'Recipient not found' using errcode = 'P0002';
  end if;
  select * into v_doc from public.documents d where d.id = v_rec.document_id for update;
  -- Re-read under the document lock: a concurrent submission may have changed the status.
  select * into v_rec from public.document_recipients r where r.id = p_recipient_id;

  if v_doc.status <> 'in_progress' or v_doc.deleted_at is not null then
    raise exception 'This document is no longer in progress' using errcode = 'SF031';
  end if;
  if v_doc.expires_at is not null and v_doc.expires_at <= now() then
    raise exception 'This document has expired' using errcode = 'SF031';
  end if;
  if v_rec.role not in ('signer', 'approver') then
    raise exception 'This recipient does not sign' using errcode = 'SF030';
  end if;
  if v_rec.status not in ('sent', 'viewed') or v_rec.signing_order <> v_doc.current_signing_order then
    raise exception 'It is not this recipient''s turn' using errcode = 'SF030';
  end if;

  p_values := coalesce(p_values, '[]'::jsonb);
  if jsonb_typeof(p_values) <> 'array' then
    raise exception 'Values must be an array' using errcode = 'SF032';
  end if;
  if v_rec.role = 'approver' and jsonb_array_length(p_values) > 0 then
    raise exception 'Approvers have no fields' using errcode = 'SF032';
  end if;
  -- Every value belongs to one of this recipient's fields, at most once.
  if exists (
    select 1 from jsonb_array_elements(p_values) e
    left join public.document_fields f
      on f.id = (e ->> 'field_id')::uuid and f.recipient_id = p_recipient_id
    where f.id is null
  ) then
    raise exception 'A value does not belong to this recipient' using errcode = 'SF032';
  end if;
  if (select count(*) from jsonb_array_elements(p_values))
     <> (select count(distinct e ->> 'field_id') from jsonb_array_elements(p_values) e) then
    raise exception 'Duplicate values' using errcode = 'SF032';
  end if;
  -- Signature and initials need an image; other required fields need a value (a checkbox: checked).
  select count(*) into v_missing
  from public.document_fields f
  left join lateral (
    select e from jsonb_array_elements(p_values) e where (e ->> 'field_id')::uuid = f.id
  ) v on true
  where f.recipient_id = p_recipient_id
    and (
      (f.type in ('signature', 'initials') and f.required and coalesce(v.e ->> 'asset_path', '') = '')
      or (f.type = 'checkbox' and f.required and coalesce(v.e ->> 'value', '') <> 'true')
      or (f.type not in ('signature', 'initials', 'checkbox', 'radio') and f.required
          and coalesce(v.e ->> 'value', '') = '')
    );
  if v_missing > 0 then
    raise exception 'Required fields are missing' using errcode = 'SF032';
  end if;

  insert into public.field_values (field_id, document_id, recipient_id, value, asset_path)
  select (e ->> 'field_id')::uuid, v_doc.id, p_recipient_id, nullif(e ->> 'value', ''), nullif(e ->> 'asset_path', '')
  from jsonb_array_elements(p_values) e;

  update public.document_recipients r
  set status = case when v_rec.role = 'approver' then 'approved'::public.recipient_status
                    else 'signed'::public.recipient_status end,
      completed_at = now(),
      viewed_at = coalesce(r.viewed_at, now())
  where r.id = p_recipient_id;

  -- Someone in this group still has to act.
  if exists (
    select 1 from public.document_recipients r
    where r.document_id = v_doc.id and r.signing_order = v_doc.current_signing_order
      and r.role in ('signer', 'approver') and r.status not in ('signed', 'approved')
  ) then
    return jsonb_build_object('outcome', 'waiting', 'activated', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_activated
  from public.activate_next_group(v_doc.id) a;

  if exists (
    select 1 from public.document_recipients r
    where r.document_id = v_doc.id and r.role in ('signer', 'approver')
      and r.status not in ('signed', 'approved')
  ) then
    return jsonb_build_object('outcome', 'advanced', 'activated', v_activated);
  end if;
  return jsonb_build_object('outcome', 'finalize', 'activated', v_activated);
end;
$$;

-- Declines on behalf of an active signer/approver: the document becomes declined (terminal) and
-- signing links stop working. Errors as complete_recipient, plus SF033 when declining is disabled.
create function public.decline_recipient(p_recipient_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec public.document_recipients;
  v_doc public.documents;
begin
  select * into v_rec from public.document_recipients r where r.id = p_recipient_id;
  if not found then
    raise exception 'Recipient not found' using errcode = 'P0002';
  end if;
  select * into v_doc from public.documents d where d.id = v_rec.document_id for update;
  select * into v_rec from public.document_recipients r where r.id = p_recipient_id;

  if v_doc.status <> 'in_progress' or v_doc.deleted_at is not null then
    raise exception 'This document is no longer in progress' using errcode = 'SF031';
  end if;
  if not v_doc.allow_decline then
    raise exception 'The sender does not allow declining' using errcode = 'SF033';
  end if;
  if v_rec.role not in ('signer', 'approver') or v_rec.status not in ('sent', 'viewed')
     or v_rec.signing_order <> v_doc.current_signing_order then
    raise exception 'It is not this recipient''s turn' using errcode = 'SF030';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 or length(p_reason) > 1000 then
    raise exception 'A reason is required' using errcode = 'SF032';
  end if;

  update public.document_recipients r
  set status = 'declined', declined_at = now(), decline_reason = trim(p_reason),
      viewed_at = coalesce(r.viewed_at, now())
  where r.id = p_recipient_id;
  update public.documents d set status = 'declined' where d.id = v_doc.id;
  update public.recipient_access_tokens t
  set revoked_at = now()
  from public.document_recipients r
  where t.recipient_id = r.id and r.document_id = v_doc.id and t.revoked_at is null;
end;
$$;

-- Final step of finalize-document, after the flattened PDF and certificate are stored: marks the
-- document completed, CCs as notified, and revokes signing links. Returns false if another request
-- already completed it (idempotent).
create function public.mark_document_completed(
  p_document_id uuid,
  p_completed_path text,
  p_certificate_path text,
  p_completed_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  select * into v_doc from public.documents d where d.id = p_document_id for update;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if v_doc.status = 'completed' then
    return false;
  end if;
  if v_doc.status <> 'in_progress' then
    raise exception 'This document is no longer in progress' using errcode = 'SF031';
  end if;
  if exists (
    select 1 from public.document_recipients r
    where r.document_id = p_document_id and r.role in ('signer', 'approver')
      and r.status not in ('signed', 'approved')
  ) then
    raise exception 'Not everyone has signed' using errcode = 'SF031';
  end if;
  if p_completed_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid hash' using errcode = 'SF032';
  end if;

  update public.documents d
  set status = 'completed', completed_at = now(), completed_path = p_completed_path,
      certificate_path = p_certificate_path, completed_sha256 = p_completed_sha256
  where d.id = p_document_id;
  update public.document_recipients r
  set status = 'sent', sent_at = now()
  where r.document_id = p_document_id and r.role = 'cc' and r.status = 'pending';
  update public.recipient_access_tokens t
  set revoked_at = now()
  from public.document_recipients r
  where t.recipient_id = r.id and r.document_id = p_document_id and t.revoked_at is null
    and t.purpose = 'sign';
  return true;
end;
$$;

revoke execute on function public.mark_recipient_viewed(uuid) from public, anon, authenticated;
revoke execute on function public.activate_next_group(uuid) from public, anon, authenticated;
revoke execute on function public.complete_recipient(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.decline_recipient(uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_document_completed(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_recipient_viewed(uuid) to service_role;
grant execute on function public.activate_next_group(uuid) to service_role;
grant execute on function public.complete_recipient(uuid, jsonb) to service_role;
grant execute on function public.decline_recipient(uuid, text) to service_role;
grant execute on function public.mark_document_completed(uuid, text, text, text) to service_role;
