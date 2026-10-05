-- DOCUMENT_VIEWED de-duplication for guests too: the viewer is a user or, for signing links, a
-- recipient. Same lock and window as before, keyed on whichever identifies the viewer.

drop function public.log_document_view(uuid, uuid, text, text, inet, text, interval);

create function public.log_document_view(
  p_document_id uuid,
  p_actor_user_id uuid,
  p_actor_name text default null,
  p_actor_email text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_window interval default interval '30 minutes',
  p_actor_recipient_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer text := coalesce(p_actor_user_id::text, 'r:' || p_actor_recipient_id::text);
begin
  if v_viewer is null then
    raise exception 'A user or recipient is required' using errcode = '22023';
  end if;
  -- Serialize concurrent opens by the same viewer, so two requests cannot both log.
  perform pg_advisory_xact_lock(hashtextextended('view:' || p_document_id::text || ':' || v_viewer, 0));
  if exists (
    select 1 from public.document_events e
    where e.document_id = p_document_id
      and e.type = 'DOCUMENT_VIEWED'
      and e.created_at > now() - p_window
      and case
        when p_actor_user_id is not null then e.actor_user_id = p_actor_user_id
        else e.actor_user_id is null and e.actor_recipient_id = p_actor_recipient_id
      end
  ) then
    return false;
  end if;
  perform public.log_event(
    p_document_id, 'DOCUMENT_VIEWED', 'Document viewed', p_actor_user_id, p_actor_recipient_id,
    p_actor_name, p_actor_email, p_ip, p_user_agent, p_metadata
  );
  return true;
end;
$$;

revoke execute on function public.log_document_view(uuid, uuid, text, text, inet, text, interval, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_document_view(uuid, uuid, text, text, inet, text, interval, uuid, jsonb)
  to service_role;
