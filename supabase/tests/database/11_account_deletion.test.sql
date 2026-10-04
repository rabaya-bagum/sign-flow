begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir fixtures.psql

-- A self-only completed document (nobody else involved) and B's own data.
insert into public.documents (id, owner_id, title, status, current_signing_order)
values ('d0000000-0000-4000-8000-0000000000d9', 'aaaaaaaa-0000-4000-8000-000000000001', 'A alone', 'completed', 1),
       ('d0000000-0000-4000-8000-0000000000da', 'bbbbbbbb-0000-4000-8000-000000000002', 'B draft', 'draft', null);
insert into public.document_recipients (document_id, user_id, name, email, role, signing_order, status)
values ('d0000000-0000-4000-8000-0000000000d9', 'aaaaaaaa-0000-4000-8000-000000000001', 'User A', 'a@test.local', 'signer', 1, 'signed');
insert into public.push_tokens (user_id, expo_push_token, platform)
values ('bbbbbbbb-0000-4000-8000-000000000002', 'ExponentPushToken[bbbb]', 'ios');
insert into public.notifications (user_id, document_id, type, title, body)
values ('bbbbbbbb-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000d2', 'request', 'x', 'x');
update public.profiles set phone = '+15550100', avatar_path = 'bbbbbbbb-0000-4000-8000-000000000002/avatar.jpg'
where id = 'bbbbbbbb-0000-4000-8000-000000000002';

-- Only the service role may call it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.delete_account_data('bbbbbbbb-0000-4000-8000-000000000002') $$, '42501', null,
  'clients cannot call delete_account_data');
select throws_ok($$ update public.profiles set deleted_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000002' $$,
  '42501', null, 'clients cannot set deleted_at');
reset role;

-- An owner with a document in progress must void it first (the Edge Function does).
select throws_ok($$ select public.delete_account_data('aaaaaaaa-0000-4000-8000-000000000001') $$, 'SF031', null,
  'documents in progress block deletion');

-- B: a signer on A's documents, with a draft of their own.
select lives_ok($$ select public.delete_account_data('bbbbbbbb-0000-4000-8000-000000000002') $$, 'B''s data is deleted');
select isnt((select deleted_at from public.documents where id = 'd0000000-0000-4000-8000-0000000000da'), null,
  'B''s draft is soft-deleted');
select is((select count(*)::int from public.push_tokens where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 0,
  'push tokens are removed');
select is((select count(*)::int from public.notifications where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 0,
  'notifications are removed');
select is((select count(*)::int from public.document_recipients where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 0,
  'recipient rows are unlinked');
select is((select count(*)::int from public.document_recipients where email = 'b@test.local'), 3,
  'recipient rows (name, email) stay on A''s documents');
select results_eq(
  $$ select full_name, email, phone, avatar_path, deleted_at is not null from public.profiles
     where id = 'bbbbbbbb-0000-4000-8000-000000000002' $$,
  $$ values ('User B'::text, 'b@test.local'::text, null::text, null::text, true) $$,
  'the profile becomes a tombstone keeping only name and email');
select throws_ok($$ select public.delete_account_data('bbbbbbbb-0000-4000-8000-000000000002') $$, 'P0002', null,
  'an account is deleted once');

-- Supabase's soft delete hashes the auth email; the tombstone keeps the real one.
update auth.users set email = 'hashed', deleted_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000002';
select is((select email from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'b@test.local',
  'the tombstone email survives the auth soft delete');

-- A, after voiding: the self-only document goes, documents with other people stay.
update public.documents set status = 'voided' where id = 'd0000000-0000-4000-8000-0000000000d2';
select public.delete_account_data('aaaaaaaa-0000-4000-8000-000000000001');
select isnt((select deleted_at from public.documents where id = 'd0000000-0000-4000-8000-0000000000d9'), null,
  'a document nobody else takes part in is deleted');
select is((select count(*)::int from public.documents
  where id in ('d0000000-0000-4000-8000-0000000000d2', 'd0000000-0000-4000-8000-0000000000d3') and deleted_at is null), 2,
  'documents involving other people are kept for them');

select * from finish();
rollback;
