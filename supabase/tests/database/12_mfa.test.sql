begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir fixtures.psql

-- A has a verified TOTP factor; B has only an unverified one.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'A phone', 'totp', 'verified', now(), now()),
  (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000002', 'B phone', 'totp', 'unverified', now(), now());

set local role authenticated;

-- A without the second factor (aal1): nothing.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select is(public.mfa_satisfied(), false, 'aal1 does not satisfy a verified factor');
select is((select count(*)::int from public.documents), 0, 'aal1 reads no documents');
select is((select count(*)::int from public.profiles), 0, 'aal1 reads no profile');
select throws_ok($$ insert into public.documents (owner_id, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'aal1 cannot create documents');
select is((select count(*)::int from public.public_profiles where id <> 'aaaaaaaa-0000-4000-8000-000000000001'), 0,
  'aal1 sees no co-participants');

-- A after the challenge (aal2): everything as before.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
select is(public.mfa_satisfied(), true, 'aal2 satisfies the factor');
select is((select count(*)::int from public.documents), 3, 'aal2 reads the owner''s documents');

-- B: an unverified factor does not lock them out.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select is(public.mfa_satisfied(), true, 'no verified factor: aal1 is enough');
select ok((select count(*) from public.documents) > 0, 'B still reads documents shared with them');

reset role;
select * from finish();
rollback;
