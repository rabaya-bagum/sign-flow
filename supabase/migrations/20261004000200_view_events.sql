-- DOCUMENT_VIEWED de-duplication (SPEC §10): at most one per user per document per 30 minutes.
-- Called by get-download-url (purpose = 'view') with the service role. Viewing never changes
-- recipient status.

create index document_events_view_dedupe_idx
  on public.document_events (document_id, actor_user_id, created_at desc)
  where type = 'DOCUMENT_VIEWED';

create function public.log_document_view(
  p_document_id uuid,
  p_actor_user_id uuid,
  p_actor_name text default null,
  p_actor_email text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_window interval default interval '30 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize concurrent opens by the same user, so two requests cannot both log.
  perform pg_advisory_xact_lock(hashtextextended('view:' || p_document_id::text || ':' || p_actor_user_id::text, 0));
  if exists (
    select 1 from public.document_events e
    where e.document_id = p_document_id
      and e.actor_user_id = p_actor_user_id
      and e.type = 'DOCUMENT_VIEWED'
      and e.created_at > now() - p_window
  ) then
    return false;
  end if;
  perform public.log_event(
    p_document_id, 'DOCUMENT_VIEWED', 'Document viewed', p_actor_user_id, null,
    p_actor_name, p_actor_email, p_ip, p_user_agent, '{}'::jsonb
  );
  return true;
end;
$$;

revoke execute on function public.log_document_view(uuid, uuid, text, text, inet, text, interval)
  from public, anon, authenticated;
grant execute on function public.log_document_view(uuid, uuid, text, text, inet, text, interval)
  to service_role;
