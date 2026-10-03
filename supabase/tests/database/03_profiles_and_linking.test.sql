begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\ir fixtures.psql

select results_eq($$ select full_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  array['User A'], 'profile is created from auth.users with full_name');

-- Unverified user with recipient rows addressed to them (different letter case).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', 'ffffffff-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'new.person@test.local', null);
insert into public.document_recipients (document_id, name, email, role, signing_order, status)
values ('d0000000-0000-4000-8000-0000000000d2', 'New Person', 'New.Person@Test.local', 'signer', 1, 'sent');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(public.link_recipients_to_user(), 0, 'unverified email links nothing');
select is_empty($$ select 1 from public.documents $$, 'unverified user still cannot see the document');

reset role;
update auth.users set email_confirmed_at = now() where id = 'ffffffff-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-4000-8000-000000000006","role":"authenticated"}', true);
select is(public.link_recipients_to_user(), 1, 'verified email links the matching recipient (case-insensitive)');
select results_eq($$ select count(*)::int from public.documents where id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  array[1], 'linked recipient can now see the document');
select is(public.link_recipients_to_user(), 0, 'linking is idempotent');

-- Profiles ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq($$ select count(*)::int from public.profiles $$, array[1], 'user sees only their own profile row');
select results_eq($$ with u as (update public.profiles set full_name = 'Renamed' where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning 1) select count(*)::int from u $$,
  array[1], 'user can update own name');
select throws_ok($$ update public.profiles set email = 'x@test.local' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '42501', null, 'user cannot change profile email directly');
select results_eq($$ with u as (update public.profiles set full_name = 'Hacked' where id = 'bbbbbbbb-0000-4000-8000-000000000002' returning 1) select count(*)::int from u $$,
  array[0], 'user cannot update another profile');
select results_eq($$ select full_name from public.public_profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002' $$,
  array['User B'], 'co-participant is visible in public_profiles');
select is_empty($$ select 1 from public.public_profiles where id = 'eeeeeeee-0000-4000-8000-000000000005' $$,
  'stranger is not visible in public_profiles');

reset role;
set local role anon;
select throws_ok($$ select 1 from public.documents $$, '42501', null, 'anon has no access to documents');

select * from finish();
rollback;
