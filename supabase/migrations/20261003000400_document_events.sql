-- Append-only audit log (SPEC §12.1). Written only server-side via log_event().

create table public.document_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id),
  type public.event_type not null,
  actor_user_id uuid references public.profiles (id),
  actor_recipient_id uuid references public.document_recipients (id),
  actor_name text,
  actor_email text,
  description text not null,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash text,
  created_at timestamptz not null default now()
);

create index document_events_doc_created_idx on public.document_events (document_id, created_at);

create function public.prevent_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'document_events is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger document_events_no_update_delete
  before update or delete on public.document_events
  for each row execute function public.prevent_event_mutation();

create trigger document_events_no_truncate
  before truncate on public.document_events
  for each statement execute function public.prevent_event_mutation();

create function public.log_event(
  p_document_id uuid,
  p_type public.event_type,
  p_description text,
  p_actor_user_id uuid default null,
  p_actor_recipient_id uuid default null,
  p_actor_name text default null,
  p_actor_email text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.document_events (
    document_id, type, description, actor_user_id, actor_recipient_id,
    actor_name, actor_email, ip, user_agent, metadata
  )
  values (
    p_document_id, p_type, p_description, p_actor_user_id, p_actor_recipient_id,
    p_actor_name, p_actor_email, p_ip, p_user_agent, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.log_event(uuid, public.event_type, text, uuid, uuid, text, text, inet, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_event(uuid, public.event_type, text, uuid, uuid, text, text, inet, text, jsonb)
  to service_role;
revoke execute on function public.prevent_event_mutation() from public, anon, authenticated;
