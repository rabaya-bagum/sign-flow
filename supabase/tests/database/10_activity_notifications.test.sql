begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

\ir fixtures.psql

-- Notifications: own rows only; read_at is the only writable column; nobody inserts ------------------
insert into public.notifications (id, user_id, document_id, type, title, body)
values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000d2', 'signed', 'B signed', 'B signed A in progress'),
  ('a1000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000d2', 'request', 'Please sign', 'A in progress');
insert into public.push_tokens (user_id, expo_push_token, platform)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'ExponentPushToken[aaaa]', 'ios');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.notifications), 1, 'a user sees only their own notifications');
select lives_ok($$ update public.notifications set read_at = now() where id = 'a1000000-0000-4000-8000-000000000001' $$,
  'a user can mark their notification read');
select is((select count(*)::int from public.notifications where read_at is not null), 1, 'read_at was set');
select throws_ok($$ update public.notifications set title = 'x' $$, '42501', null, 'only read_at is writable');
select throws_ok($$ insert into public.notifications (user_id, type, title, body)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'x', 'x') $$, '42501', null, 'clients cannot create notifications');
select is((select count(*)::int from public.push_tokens), 1, 'a user sees their own push tokens');
select throws_ok($$ insert into public.push_tokens (user_id, expo_push_token, platform)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'ExponentPushToken[bbbb]', 'ios') $$, '42501', null,
  'push tokens are registered through register-push-token');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$ with u as (update public.notifications set read_at = null where id = 'a1000000-0000-4000-8000-000000000001' returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'a user cannot mark someone else''s notification');
select is((select count(*)::int from public.push_tokens), 0, 'a user cannot see someone else''s push tokens');

-- Activity feed ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok((select count(*) from public.list_activity()) >= 2, 'the owner sees events across their documents');
select is((select count(*)::int from public.list_activity(p_types => array['DOCUMENT_COMPLETED']::public.event_type[])), 1,
  'the feed filters by event type');
select is(
  (select count(*)::int from public.list_activity(p_before_created_at => (select max(created_at) from public.document_events) + interval '1 second', p_limit => 1)),
  1, 'the feed paginates');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.list_activity()), 0, 'a stranger sees no activity');
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.list_activity()), 0, 'a pending recipient sees no activity yet');

select throws_ok($$ select * from public.void_document('d0000000-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'clients cannot call void_document directly');
select throws_ok($$ select public.run_cron_tick() $$, '42501', null, 'clients cannot trigger cron-tick');
reset role;

-- Void ------------------------------------------------------------------------------------------------
insert into public.recipient_access_tokens (recipient_id, token_hash, expires_at)
select id, repeat('c', 64), now() + interval '1 day' from public.document_recipients
where document_id = 'd0000000-0000-4000-8000-0000000000d2' and email = 'b@test.local';

select throws_ok($$ select * from public.void_document('d0000000-0000-4000-8000-0000000000d2', 'bbbbbbbb-0000-4000-8000-000000000002', 'x') $$,
  'P0002', null, 'only the owner can void');
select throws_ok($$ select * from public.void_document('d0000000-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', '  ') $$,
  'SF032', null, 'voiding needs a reason');
select results_eq(
  $$ select email from public.void_document('d0000000-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'Sent by mistake') $$,
  $$ values ('b@test.local') $$, 'voiding returns active recipients only (not pending, not CC)');
select results_eq(
  $$ select d.status::text, d.void_reason, (select count(*)::int from public.recipient_access_tokens t
       join public.document_recipients r on r.id = t.recipient_id where r.document_id = d.id and t.revoked_at is null)
     from public.documents d where d.id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  $$ values ('voided', 'Sent by mistake', 0) $$, 'voided with the reason; links revoked');
select throws_ok($$ select * from public.void_document('d0000000-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'again') $$,
  'SF031', null, 'a voided document cannot be voided again');

-- Reminders -------------------------------------------------------------------------------------------
insert into public.documents (id, owner_id, title, status, current_signing_order, sent_at, expires_at,
  reminder_first_after_days, reminder_repeat_every_days)
values ('d0000000-0000-4000-8000-0000000000d5', 'aaaaaaaa-0000-4000-8000-000000000001', 'Reminders', 'in_progress', 1,
  now() - interval '4 days', now() + interval '10 days', 3, 2);
insert into public.document_recipients (id, document_id, name, email, role, signing_order, status, sent_at)
values
  ('e5000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000d5', 'Rae', 'rae@test.local', 'signer', 1, 'sent', now() - interval '4 days'),
  ('e5000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000d5', 'Sig', 'sig@test.local', 'signer', 1, 'signed', now() - interval '4 days'),
  ('e5000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-0000000000d5', 'Later', 'later@test.local', 'signer', 2, 'pending', null);

select results_eq($$ select name from public.claim_due_reminders() where document_id = 'd0000000-0000-4000-8000-0000000000d5' $$, $$ values ('Rae') $$,
  'a reminder is due 3 days after sending, only for active un-acted signers');
select is((select count(*)::int from public.claim_due_reminders() where document_id = 'd0000000-0000-4000-8000-0000000000d5'), 0, 'claimed reminders are not sent twice');
select is((select count(*)::int from public.claim_due_reminders(now() + interval '1 day') where document_id = 'd0000000-0000-4000-8000-0000000000d5'), 0, 'not yet due again after 1 day');
select results_eq($$ select name from public.claim_due_reminders(now() + interval '2 days 1 minute') where document_id = 'd0000000-0000-4000-8000-0000000000d5' $$, $$ values ('Rae') $$,
  'repeats every 2 days');
select throws_ok($$ select public.claim_manual_reminder('e5000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'SF040', null, 'manual Remind is limited to once per 24 hours');
update public.document_recipients set last_reminded_at = now() - interval '25 hours' where id = 'e5000000-0000-4000-8000-000000000001';
select ok(public.claim_manual_reminder('e5000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001') is not null,
  'manual Remind works after 24 hours');
select throws_ok($$ select public.claim_manual_reminder('e5000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'SF030', null, 'pending recipients cannot be reminded');

-- Expiry ----------------------------------------------------------------------------------------------
select is((select count(*)::int from public.claim_expiry_warnings(now() + interval '9 days 12 hours') where document_id = 'd0000000-0000-4000-8000-0000000000d5'), 1,
  'documents expiring within 24 hours are warned');
select results_eq(
  $$ select title from public.expire_due_documents(now() + interval '11 days') where document_id = 'd0000000-0000-4000-8000-0000000000d5' $$, $$ values ('Reminders') $$,
  'documents past their expiry are expired');

select results_eq($$ select schedule, command from cron.job where jobname = 'signflow-cron-tick' $$,
  $$ values ('*/15 * * * *'::text, 'select public.run_cron_tick()'::text) $$, 'cron-tick is scheduled every 15 minutes');

select * from finish();
rollback;
