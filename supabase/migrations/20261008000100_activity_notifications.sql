-- Activity, notifications, reminders, expiry, void and remind (SPEC §5.8, §6.2, §11, §13).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- In-app inbox ---------------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  type text not null check (length(type) <= 40),
  title text not null check (length(title) <= 200),
  body text not null check (length(body) <= 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- Push tokens: written by register-push-token (a token can move between accounts on one device).
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique check (expo_push_token ~ '^Expo(nent)?PushToken\[[^\]]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;

create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- "Expiring in 24 hours" is sent once per document.
alter table public.documents add column expiry_warned_at timestamptz;

-- Activity feed (SPEC §5.8) ----------------------------------------------------------------------------
-- Every event the caller can see (RLS on events and documents), newest first, keyset-paginated.
create function public.list_activity(
  p_before_created_at timestamptz default null,
  p_before_id bigint default null,
  p_limit int default 30,
  p_types public.event_type[] default null
)
returns table (
  id bigint,
  document_id uuid,
  document_title text,
  type public.event_type,
  description text,
  actor_name text,
  actor_email text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.document_id, d.title, e.type, e.description, e.actor_name, e.actor_email, e.created_at
  from public.document_events e
  join public.documents d on d.id = e.document_id
  where (p_types is null or e.type = any (p_types))
    and (
      p_before_created_at is null
      or (e.created_at, e.id) < (p_before_created_at, coalesce(p_before_id, 9223372036854775807))
    )
  order by e.created_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke execute on function public.list_activity(timestamptz, bigint, int, public.event_type[]) from public, anon;
grant execute on function public.list_activity(timestamptz, bigint, int, public.event_type[]) to authenticated;

-- Void (owner) -----------------------------------------------------------------------------------------
-- In progress → voided (terminal). Revokes every link. Returns the recipients to tell: those whose group
-- was active or past (not pending), CCs excluded. Errors: P0002 not found / not owner, SF031 not in
-- progress, SF032 reason missing.
create function public.void_document(p_document_id uuid, p_owner_id uuid, p_reason text)
returns table (recipient_id uuid, name text, email text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  select * into v_doc from public.documents d where d.id = p_document_id for update;
  if not found or v_doc.owner_id <> p_owner_id or v_doc.deleted_at is not null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'in_progress' then
    raise exception 'Only documents in progress can be voided' using errcode = 'SF031';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 or length(p_reason) > 1000 then
    raise exception 'A reason is required' using errcode = 'SF032';
  end if;

  update public.documents d
  set status = 'voided', voided_at = now(), void_reason = trim(p_reason)
  where d.id = p_document_id;
  update public.recipient_access_tokens t
  set revoked_at = now()
  from public.document_recipients r
  where t.recipient_id = r.id and r.document_id = p_document_id and t.revoked_at is null;

  return query
  select r.id, r.name, r.email::text, r.user_id
  from public.document_recipients r
  where r.document_id = p_document_id and r.role <> 'cc' and r.status <> 'pending';
end;
$$;

-- Reminders --------------------------------------------------------------------------------------------
-- Manual Remind: at most once per recipient per 24 hours (SPEC §11). Claims the slot atomically.
-- Errors: P0002 not found / not owner, SF030 recipient not active, SF031 document not in progress,
-- SF040 reminded less than 24 h ago.
create function public.claim_manual_reminder(p_recipient_id uuid, p_owner_id uuid)
returns timestamptz
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
  if v_doc.owner_id <> p_owner_id or v_doc.deleted_at is not null then
    raise exception 'Recipient not found' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'in_progress' then
    raise exception 'This document is no longer in progress' using errcode = 'SF031';
  end if;
  select * into v_rec from public.document_recipients r where r.id = p_recipient_id;
  if v_rec.role = 'cc' or v_rec.status not in ('sent', 'viewed') then
    raise exception 'This recipient has nothing to do right now' using errcode = 'SF030';
  end if;
  if v_rec.last_reminded_at is not null and v_rec.last_reminded_at > now() - interval '24 hours' then
    raise exception 'Reminded less than 24 hours ago' using errcode = 'SF040';
  end if;
  update public.document_recipients r set last_reminded_at = now() where r.id = p_recipient_id;
  return now();
end;
$$;

-- Automatic reminders due now (SPEC §11): active, un-acted signers/approvers of documents in progress
-- with reminders on, when now ≥ coalesce(last_reminded_at, sent_at) + interval. Claims them (sets
-- last_reminded_at) in the same statement, so overlapping ticks never send twice.
create function public.claim_due_reminders(p_now timestamptz default now())
returns table (
  recipient_id uuid,
  document_id uuid,
  name text,
  email text,
  user_id uuid,
  role public.recipient_role
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select r.id
    from public.document_recipients r
    join public.documents d on d.id = r.document_id
    where d.status = 'in_progress' and d.deleted_at is null
      and (d.expires_at is null or d.expires_at > p_now)
      and d.reminder_first_after_days is not null
      and r.role in ('signer', 'approver')
      and r.status in ('sent', 'viewed')
      and r.signing_order = d.current_signing_order
      and r.email is not null
      and p_now >= case
        when r.last_reminded_at is null
          then r.sent_at + make_interval(days => d.reminder_first_after_days)
        else r.last_reminded_at + make_interval(days => coalesce(d.reminder_repeat_every_days, d.reminder_first_after_days))
      end
    for update of r skip locked
  )
  update public.document_recipients r
  set last_reminded_at = p_now
  from due
  where r.id = due.id
  returning r.id, r.document_id, r.name, r.email::text, r.user_id, r.role;
$$;

-- Expiry (SPEC §11): documents in progress past expires_at become expired; links are revoked.
create function public.expire_due_documents(p_now timestamptz default now())
returns table (document_id uuid, owner_id uuid, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with expired as (
    update public.documents d
    set status = 'expired'
    where d.status = 'in_progress' and d.deleted_at is null and d.expires_at <= p_now
    returning d.id, d.owner_id, d.title
  ), revoked as (
    update public.recipient_access_tokens t
    set revoked_at = p_now
    from public.document_recipients r
    where t.recipient_id = r.id and t.revoked_at is null and t.purpose = 'sign'
      and r.document_id in (select e.id from expired e)
    returning 1
  )
  select e.id, e.owner_id, e.title from expired e;
end;
$$;

-- "Expiring in 24 hours" (SHOULD): claims documents to warn, once each.
create function public.claim_expiry_warnings(p_now timestamptz default now())
returns table (document_id uuid, title text, expires_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  update public.documents d
  set expiry_warned_at = p_now
  where d.status = 'in_progress' and d.deleted_at is null and d.expiry_warned_at is null
    and d.expires_at > p_now and d.expires_at <= p_now + interval '24 hours'
  returning d.id, d.title, d.expires_at;
$$;

-- Documents whose signers all finished but whose finalization failed (retried by cron-tick).
create function public.stalled_finalizations()
returns table (document_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.documents d
  where d.status = 'in_progress' and d.deleted_at is null
    and exists (select 1 from public.document_recipients r where r.document_id = d.id and r.role in ('signer', 'approver'))
    and not exists (
      select 1 from public.document_recipients r
      where r.document_id = d.id and r.role in ('signer', 'approver') and r.status not in ('signed', 'approved')
    );
$$;

revoke execute on function public.void_document(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_manual_reminder(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(timestamptz) from public, anon, authenticated;
revoke execute on function public.expire_due_documents(timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_expiry_warnings(timestamptz) from public, anon, authenticated;
revoke execute on function public.stalled_finalizations() from public, anon, authenticated;
grant execute on function public.void_document(uuid, uuid, text) to service_role;
grant execute on function public.claim_manual_reminder(uuid, uuid) to service_role;
grant execute on function public.claim_due_reminders(timestamptz) to service_role;
grant execute on function public.expire_due_documents(timestamptz) to service_role;
grant execute on function public.claim_expiry_warnings(timestamptz) to service_role;
grant execute on function public.stalled_finalizations() to service_role;

-- Cron (SPEC §10 cron-tick: every 15 minutes) ---------------------------------------------------------
-- The job POSTs to the cron-tick Edge Function. Its URL and shared secret live in Vault (per
-- environment, never in a migration): secrets `cron_tick_url` and `cron_tick_secret`. Without them the
-- job does nothing. Local development seeds both (supabase/seed.sql).
create function public.run_cron_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'cron_tick_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_tick_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.run_cron_tick() from public, anon, authenticated;
grant execute on function public.run_cron_tick() to service_role;

select cron.schedule('signflow-cron-tick', '*/15 * * * *', 'select public.run_cron_tick()');

-- uploads-tmp sweep (SPEC §9): images left behind by abandoned conversions, older than 24 hours.
create function public.stale_tmp_uploads(p_older_than interval default interval '24 hours', p_limit int default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'uploads-tmp' and o.created_at < now() - p_older_than
  order by o.created_at
  limit p_limit;
$$;
revoke execute on function public.stale_tmp_uploads(interval, int) from public, anon, authenticated;
grant execute on function public.stale_tmp_uploads(interval, int) to service_role;
