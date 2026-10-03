begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

\ir fixtures.psql

-- Visibility ---------------------------------------------------------------
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq($$ select count(*)::int from public.documents $$, array[3], 'owner sees all own documents');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is_empty($$ select 1 from public.documents where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  'recipient cannot see a draft they are listed on');
select results_eq($$ select count(*)::int from public.documents where id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  array[1], 'active recipient can see an in-progress document');
select results_eq($$ select count(*)::int from public.document_recipients where document_id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  array[3], 'active recipient sees all recipients of the document');

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is_empty($$ select 1 from public.documents where id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  'recipient whose group is pending cannot see the document');
select is_empty($$ select 1 from public.document_recipients where document_id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  'recipient whose group is pending cannot see its recipients');

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is_empty($$ select 1 from public.documents where id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  'CC cannot see the document before completion');
select results_eq($$ select count(*)::int from public.documents where id = 'd0000000-0000-4000-8000-0000000000d3' $$,
  array[1], 'CC can see the completed document');

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is_empty($$ select 1 from public.documents $$, 'stranger sees no documents');
select is_empty($$ select 1 from public.document_recipients $$, 'stranger sees no recipients');

-- Mutations by another user --------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq($$ with u as (update public.documents set title = 'hacked' where id = 'd0000000-0000-4000-8000-0000000000d2' returning 1) select count(*)::int from u $$,
  array[0], 'user B cannot update user A''s document');
select results_eq($$ with u as (delete from public.document_recipients where document_id = 'd0000000-0000-4000-8000-0000000000d1' returning 1) select count(*)::int from u $$,
  array[0], 'user B cannot delete recipients of user A''s draft');
select throws_ok($$ insert into public.document_recipients (document_id, name, email) values ('d0000000-0000-4000-8000-0000000000d1', 'X', 'x@test.local') $$,
  '42501', null, 'user B cannot add recipients to user A''s draft');
select throws_ok($$ insert into public.documents (owner_id, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'spoofed') $$,
  '42501', null, 'user B cannot create a document owned by user A');

-- Owner limits ---------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.documents set status = 'completed' where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  '42501', 'permission denied for table documents', 'owner cannot update status (column privilege)');
select throws_ok($$ update public.documents set status = 'draft' where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  '42501', 'permission denied for table documents', 'owner cannot write status even to the same value');
select throws_ok($$ update public.documents set original_path = 'x' where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  '42501', 'permission denied for table documents', 'owner cannot update storage paths');
select throws_ok($$ update public.documents set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  '42501', 'permission denied for table documents', 'owner cannot set deleted_at');
select throws_ok($$ update public.documents set owner_id = 'bbbbbbbb-0000-4000-8000-000000000002' where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  '42501', 'permission denied for table documents', 'owner cannot transfer ownership');
select throws_ok($$ insert into public.documents (owner_id, title, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'completed') $$,
  '42501', null, 'owner cannot insert a non-draft document');
select throws_ok($$ delete from public.documents where id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'owner cannot hard-delete documents');
select results_eq($$ with u as (update public.documents set title = 'renamed' where id = 'd0000000-0000-4000-8000-0000000000d2' returning 1) select count(*)::int from u $$,
  array[0], 'owner cannot edit a document after sending');
select results_eq($$ with u as (update public.documents set title = 'renamed' where id = 'd0000000-0000-4000-8000-0000000000d1' returning 1) select count(*)::int from u $$,
  array[1], 'owner can rename own draft');
select lives_ok($$ insert into public.documents (owner_id, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'New draft') $$,
  'owner can create a draft');
select throws_ok($$ update public.document_recipients set status = 'signed' where document_id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  '42501', null, 'owner cannot set recipient status');

select * from finish();
rollback;
