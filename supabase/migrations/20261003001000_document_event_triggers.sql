-- Audit events for client-side document writes (SPEC §12.1): DOCUMENT_CREATED, DOCUMENT_RENAMED.
-- IP and user agent come from the request headers PostgREST exposes to the transaction.

create function public.request_header(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(current_setting('request.headers', true), '')::json ->> p_name;
exception when others then
  return null;
end;
$$;

create function public.request_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(trim(split_part(public.request_header('x-forwarded-for'), ',', 1)), '')::inet;
exception when others then
  return null;
end;
$$;

create function public.log_document_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.owner_id);
  v_name text;
  v_email text;
begin
  select p.full_name, p.email into v_name, v_email from public.profiles p where p.id = v_actor;

  if tg_op = 'INSERT' then
    perform public.log_event(
      new.id, 'DOCUMENT_CREATED', 'Document created', v_actor, null, v_name, v_email,
      public.request_ip(), public.request_header('user-agent'), '{}'::jsonb
    );
  elsif new.title is distinct from old.title then
    perform public.log_event(
      new.id, 'DOCUMENT_RENAMED', 'Document renamed', v_actor, null, v_name, v_email,
      public.request_ip(), public.request_header('user-agent'),
      jsonb_build_object('from', old.title, 'to', new.title)
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.log_document_write() from public, anon, authenticated;

create trigger documents_log_insert
  after insert on public.documents
  for each row execute function public.log_document_write();

create trigger documents_log_rename
  after update of title on public.documents
  for each row execute function public.log_document_write();
