-- Sending (SPEC §6.2, §7, §10 send-document). Service-role only: send-document validates with the
-- shared rules, then calls send_document(), which re-checks inside the transaction and activates
-- group 1. Tokens are issued by the function; only their SHA-256 hash is stored.

create table public.recipient_access_tokens (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.document_recipients (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index recipient_access_tokens_recipient_idx on public.recipient_access_tokens (recipient_id);

-- Clients never see tokens (not even hashes).
alter table public.recipient_access_tokens enable row level security;
revoke all on public.recipient_access_tokens from anon, authenticated;

-- Validates a draft for sending and moves it to in_progress with group 1 active. Raises SF020 with a
-- reason when the draft is not sendable (the client-side rules in shared/send.ts give details).
-- Returns the activated recipients (to notify); CCs stay pending until completion.
create function public.send_document(
  p_document_id uuid,
  p_owner_id uuid,
  p_email_subject text,
  p_email_message text,
  p_expires_at timestamptz,
  p_reminder_first_after_days int,
  p_reminder_repeat_every_days int,
  p_require_email_otp boolean,
  p_allow_decline boolean
)
returns table (recipient_id uuid, name text, email text, user_id uuid, role public.recipient_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.documents;
  v_order int;
begin
  select * into v_doc from public.documents d where d.id = p_document_id for update;
  if not found or v_doc.owner_id <> p_owner_id or v_doc.deleted_at is not null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'Only drafts can be sent' using errcode = 'SF020';
  end if;
  if v_doc.original_path is null then
    raise exception 'The document has no file' using errcode = 'SF020';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '366 days' then
    raise exception 'Expiry must be in the future and within a year' using errcode = 'SF020';
  end if;
  if not exists (select 1 from public.document_recipients r where r.document_id = p_document_id and r.role = 'signer') then
    raise exception 'At least one signer is required' using errcode = 'SF020';
  end if;
  if exists (select 1 from public.document_recipients r where r.document_id = p_document_id and r.email is null) then
    raise exception 'Every recipient needs an email' using errcode = 'SF020';
  end if;
  if exists (
    select 1 from public.document_recipients r
    where r.document_id = p_document_id and r.role = 'signer'
      and not exists (select 1 from public.document_fields f where f.recipient_id = r.id and f.type = 'signature')
  ) then
    raise exception 'Every signer needs a signature field' using errcode = 'SF020';
  end if;
  if exists (
    select 1 from public.document_fields f join public.document_recipients r on r.id = f.recipient_id
    where f.document_id = p_document_id and r.role <> 'signer'
  ) then
    raise exception 'Only signers can have fields' using errcode = 'SF020';
  end if;

  select min(r.signing_order) into v_order
  from public.document_recipients r where r.document_id = p_document_id and r.role <> 'cc';

  update public.documents d
  set status = 'in_progress',
      sent_at = now(),
      current_signing_order = v_order,
      email_subject = p_email_subject,
      email_message = p_email_message,
      expires_at = p_expires_at,
      reminder_first_after_days = p_reminder_first_after_days,
      reminder_repeat_every_days = p_reminder_repeat_every_days,
      require_email_otp = coalesce(p_require_email_otp, false),
      allow_decline = coalesce(p_allow_decline, true)
  where d.id = p_document_id;

  -- Recipients who already have a verified account get in-app access now (SPEC §6.4).
  update public.document_recipients r
  set user_id = p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where r.document_id = p_document_id and r.user_id is null
    and lower(p.email::text) = lower(r.email::text) and u.email_confirmed_at is not null;

  return query
  update public.document_recipients r
  set status = 'sent', sent_at = now()
  where r.document_id = p_document_id and r.signing_order = v_order and r.role <> 'cc'
  returning r.id, r.name, r.email::text, r.user_id, r.role;
end;
$$;

revoke execute on function public.send_document(uuid, uuid, text, text, timestamptz, int, int, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.send_document(uuid, uuid, text, text, timestamptz, int, int, boolean, boolean)
  to service_role;
