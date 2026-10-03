-- Extensions and enums used across the SignFlow schema (SPEC §8).

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.document_status as enum (
  'draft', 'in_progress', 'completed', 'declined', 'expired', 'voided'
);

create type public.recipient_role as enum ('signer', 'approver', 'viewer', 'cc');

create type public.recipient_status as enum (
  'pending', 'sent', 'viewed', 'signed', 'approved', 'declined'
);

create type public.event_type as enum (
  'DOCUMENT_CREATED', 'DOCUMENT_UPLOADED', 'DOCUMENT_RENAMED', 'DOCUMENT_SENT', 'RECIPIENT_NOTIFIED',
  'DOCUMENT_VIEWED', 'ESIGN_CONSENT_ACCEPTED', 'OTP_VERIFIED', 'FIELDS_COMPLETED', 'DOCUMENT_SIGNED',
  'DOCUMENT_APPROVED', 'DOCUMENT_DECLINED', 'REMINDER_SENT', 'RECIPIENT_UPDATED', 'DOCUMENT_COMPLETED',
  'DOCUMENT_DOWNLOADED', 'DOCUMENT_VOIDED', 'DOCUMENT_EXPIRED', 'DOCUMENT_DELETED'
);

-- Shared trigger: keep updated_at current.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
