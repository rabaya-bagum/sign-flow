begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures.psql

-- As postgres (table owner) the append-only trigger still blocks mutation.
select throws_ok($$ update public.document_events set description = 'x' $$,
  '42501', 'document_events is append-only', 'even the table owner cannot update events');
select throws_ok($$ delete from public.document_events $$,
  '42501', 'document_events is append-only', 'even the table owner cannot delete events');
select lives_ok($$ select public.log_event('d0000000-0000-4000-8000-0000000000d2', 'REMINDER_SENT', 'Reminder sent') $$,
  'log_event works for privileged callers');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ insert into public.document_events (document_id, type, description) values ('d0000000-0000-4000-8000-0000000000d2', 'DOCUMENT_SIGNED', 'forged') $$,
  '42501', null, 'owner cannot insert events directly');
select throws_ok($$ update public.document_events set description = 'x' $$,
  '42501', null, 'owner cannot update events');
select throws_ok($$ delete from public.document_events $$,
  '42501', null, 'owner cannot delete events');
select throws_ok($$ select public.log_event('d0000000-0000-4000-8000-0000000000d2', 'DOCUMENT_SIGNED', 'forged') $$,
  '42501', null, 'authenticated cannot call log_event');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq($$ select count(*)::int from public.document_events where document_id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  array[2], 'active participant can read the document''s events');

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is_empty($$ select 1 from public.document_events $$, 'pending participant cannot read events');

reset role;
set local role anon;
select throws_ok($$ select public.log_event('d0000000-0000-4000-8000-0000000000d2', 'DOCUMENT_SIGNED', 'forged') $$,
  '42501', null, 'anon cannot call log_event');

select * from finish();
rollback;
