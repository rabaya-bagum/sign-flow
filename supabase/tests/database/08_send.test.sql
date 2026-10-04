begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir fixtures.psql

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select * from public.send_document('d0000000-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001',
  null, null, now() + interval '7 days', null, null, false, true) $$,
  '42501', null, 'the owner cannot call send_document directly (send-document only)');
select throws_ok($$ select * from public.recipient_access_tokens $$, '42501', null, 'clients cannot read tokens');
select throws_ok($$ update public.documents set status = 'in_progress' where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'clients cannot change document status');

reset role;
-- The function itself re-checks completeness: the fixture draft has no file.
select throws_ok($$ select * from public.send_document('d0000000-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001',
  null, null, now() + interval '7 days', null, null, false, true) $$,
  'SF020', 'The document has no file', 'send_document refuses a draft without a file');
select throws_ok($$ select * from public.send_document('d0000000-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000002',
  null, null, now() + interval '7 days', null, null, false, true) $$,
  'P0002', null, 'send_document refuses a caller who is not the owner');

select * from finish();
rollback;
