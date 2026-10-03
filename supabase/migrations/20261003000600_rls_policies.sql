-- Row Level Security and column privileges (SPEC §14 matrix).
-- Supabase grants table privileges to anon/authenticated by default; we revoke them and grant
-- back only what clients may do, so protected columns stay server-only even if a policy is wrong.

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_recipients enable row level security;
alter table public.document_events enable row level security;
alter table public.document_user_state enable row level security;

revoke all on public.profiles, public.documents, public.document_recipients,
  public.document_events, public.document_user_state from anon, authenticated;

-- profiles ------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_path, theme, locale, notification_prefs,
  default_expiry_days, default_reminder) on public.profiles to authenticated;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- documents -----------------------------------------------------------------
grant select on public.documents to authenticated;
grant insert (id, owner_id, title, email_subject, email_message, expires_at,
  reminder_first_after_days, reminder_repeat_every_days, require_email_otp, allow_decline)
  on public.documents to authenticated;
grant update (title, email_subject, email_message, expires_at,
  reminder_first_after_days, reminder_repeat_every_days, require_email_otp, allow_decline)
  on public.documents to authenticated;

create policy documents_select_owner_or_participant on public.documents
  for select to authenticated
  using (
    deleted_at is null
    and (owner_id = (select auth.uid()) or public.is_active_participant(id))
  );

create policy documents_insert_own_draft on public.documents
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft' and deleted_at is null);

create policy documents_update_own_draft on public.documents
  for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft' and deleted_at is null)
  with check (owner_id = (select auth.uid()) and status = 'draft' and deleted_at is null);

-- No client DELETE: drafts are soft-deleted by the delete-draft Edge Function (SPEC §6.2).

-- document_recipients -------------------------------------------------------
grant select on public.document_recipients to authenticated;
grant insert (id, document_id, name, email, role, signing_order) on public.document_recipients to authenticated;
grant update (name, email, role, signing_order) on public.document_recipients to authenticated;
grant delete on public.document_recipients to authenticated;

create policy recipients_select on public.document_recipients
  for select to authenticated
  using (public.is_document_owner(document_id) or public.is_active_participant(document_id));

create policy recipients_insert_draft_owner on public.document_recipients
  for insert to authenticated
  with check (public.is_draft_owner(document_id));

create policy recipients_update_draft_owner on public.document_recipients
  for update to authenticated
  using (public.is_draft_owner(document_id))
  with check (public.is_draft_owner(document_id));

create policy recipients_delete_draft_owner on public.document_recipients
  for delete to authenticated
  using (public.is_draft_owner(document_id));

-- document_events (append-only; inserts only via log_event / service role) --
grant select on public.document_events to authenticated;

create policy events_select on public.document_events
  for select to authenticated
  using (public.is_document_owner(document_id) or public.is_active_participant(document_id));

-- document_user_state -------------------------------------------------------
grant select, insert, update, delete on public.document_user_state to authenticated;

create policy user_state_select_own on public.document_user_state
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_state_insert_own on public.document_user_state
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (public.is_document_owner(document_id) or public.is_active_participant(document_id))
  );

create policy user_state_update_own on public.document_user_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_state_delete_own on public.document_user_state
  for delete to authenticated
  using (user_id = (select auth.uid()));
