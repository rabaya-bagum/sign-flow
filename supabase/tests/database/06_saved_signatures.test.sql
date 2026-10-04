begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

\ir fixtures.psql

-- Helpers: user A = aaaaaaaa…, user B = bbbbbbbb….
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.sig(p_n int) returns uuid language sql as $$
  select ('5a000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');

-- Insert ----------------------------------------------------------------------------------------
select lives_ok($$
  insert into public.saved_signatures (id, user_id, kind, method, storage_path)
  values (pg_temp.sig(1), 'aaaaaaaa-0000-4000-8000-000000000001', 'signature', 'drawn',
          'aaaaaaaa-0000-4000-8000-000000000001/' || pg_temp.sig(1) || '.png')
$$, 'user A saves a drawn signature');
select is((select is_default from public.saved_signatures where id = pg_temp.sig(1)), true,
  'the first signature of a kind becomes the default');

select lives_ok($$
  insert into public.saved_signatures (id, user_id, kind, method, storage_path, typed_text, font_key)
  values (pg_temp.sig(2), 'aaaaaaaa-0000-4000-8000-000000000001', 'signature', 'typed',
          'aaaaaaaa-0000-4000-8000-000000000001/' || pg_temp.sig(2) || '.png', 'User A', 'dancing-script')
$$, 'user A saves a typed signature');
select is((select is_default from public.saved_signatures where id = pg_temp.sig(2)), false,
  'later signatures are not the default');

select throws_ok($$
  insert into public.saved_signatures (user_id, kind, method, storage_path, is_default)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'signature', 'drawn', 'x', true)
$$, '42501', null, 'clients cannot set is_default directly');
select throws_ok($$
  insert into public.saved_signatures (id, user_id, kind, method, storage_path)
  values (pg_temp.sig(3), 'aaaaaaaa-0000-4000-8000-000000000001', 'signature', 'drawn',
          'aaaaaaaa-0000-4000-8000-000000000001/other.png')
$$, '23514', null, 'storage_path must be {user_id}/{id}.png');
select throws_ok($$
  insert into public.saved_signatures (id, user_id, kind, method, storage_path)
  values (pg_temp.sig(3), 'aaaaaaaa-0000-4000-8000-000000000001', 'signature', 'typed',
          'aaaaaaaa-0000-4000-8000-000000000001/' || pg_temp.sig(3) || '.png')
$$, '23514', null, 'typed signatures need typed_text and font_key');
select throws_ok($$
  insert into public.saved_signatures (id, user_id, kind, method, storage_path)
  values (pg_temp.sig(3), 'bbbbbbbb-0000-4000-8000-000000000002', 'signature', 'drawn',
          'bbbbbbbb-0000-4000-8000-000000000002/' || pg_temp.sig(3) || '.png')
$$, '42501', null, 'user A cannot create rows for user B');

-- Limit: 5 per kind ----------------------------------------------------------------------------
select lives_ok($$
  insert into public.saved_signatures (id, user_id, kind, method, storage_path)
  select pg_temp.sig(n), 'aaaaaaaa-0000-4000-8000-000000000001', 'signature', 'uploaded',
         'aaaaaaaa-0000-4000-8000-000000000001/' || pg_temp.sig(n) || '.png'
  from generate_series(3, 5) n
$$, 'up to 5 signatures per kind');
select throws_ok($$
  insert into public.saved_signatures (id, user_id, kind, method, storage_path)
  values (pg_temp.sig(6), 'aaaaaaaa-0000-4000-8000-000000000001', 'signature', 'drawn',
          'aaaaaaaa-0000-4000-8000-000000000001/' || pg_temp.sig(6) || '.png')
$$, 'SF001', null, 'the 6th signature of a kind is rejected');
select lives_ok($$
  insert into public.saved_signatures (id, user_id, kind, method, storage_path)
  values (pg_temp.sig(7), 'aaaaaaaa-0000-4000-8000-000000000001', 'initials', 'drawn',
          'aaaaaaaa-0000-4000-8000-000000000001/' || pg_temp.sig(7) || '.png')
$$, 'the limit is per kind: initials are separate');
select is((select is_default from public.saved_signatures where id = pg_temp.sig(7)), true,
  'the first initials are the default initials');

-- Default ----------------------------------------------------------------------------------------
select lives_ok($$ select public.set_default_signature(pg_temp.sig(2)) $$, 'set_default_signature works');
select results_eq($$ select id from public.saved_signatures where is_default and kind = 'signature' $$,
  array[pg_temp.sig(2)], 'exactly one default signature after switching');
select is((select is_default from public.saved_signatures where id = pg_temp.sig(7)), true,
  'switching the signature default leaves the initials default alone');
select throws_ok($$ update public.saved_signatures set is_default = true where id = pg_temp.sig(3) $$,
  '42501', null, 'clients cannot update rows directly');
reset role;
select throws_ok($$ update public.saved_signatures set is_default = true where id = '5a000000-0000-4000-8000-000000000003' $$,
  '23505', null, 'the database allows only one default per kind');
set local role authenticated;

-- Isolation ---------------------------------------------------------------------------------------
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select is_empty($$ select 1 from public.saved_signatures $$, 'user B cannot read user A''s signatures');
select throws_ok($$ select public.set_default_signature(pg_temp.sig(1)) $$, 'P0002', null,
  'user B cannot change user A''s default');
delete from public.saved_signatures where id = pg_temp.sig(1);
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select results_eq($$ select count(*)::int from public.saved_signatures $$, array[6],
  'user B''s delete removed nothing');

-- Delete promotes a new default ------------------------------------------------------------------
-- Rows inserted in one transaction share created_at; make sig(5) the most recent.
reset role;
update public.saved_signatures set created_at = now() + interval '1 second' where id = pg_temp.sig(5);
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
delete from public.saved_signatures where id = pg_temp.sig(2);
select results_eq($$ select id from public.saved_signatures where is_default and kind = 'signature' $$,
  array[pg_temp.sig(5)], 'deleting the default promotes the most recent remaining signature');

-- Storage ---------------------------------------------------------------------------------------
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('signatures', 'aaaaaaaa-0000-4000-8000-000000000001/' || pg_temp.sig(1) || '.png') $$,
  'user A uploads into their own signatures folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('signatures', 'aaaaaaaa-0000-4000-8000-000000000001/notes.txt') $$,
  '42501', null, 'only {uuid}.png names are allowed');
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('signatures', 'aaaaaaaa-0000-4000-8000-000000000001/' || pg_temp.sig(9) || '.png') $$,
  '42501', null, 'user B cannot write into user A''s signatures folder');
select is_empty($$ select 1 from storage.objects where bucket_id = 'signatures' $$,
  'user B cannot read user A''s signature images');
reset role;
-- Storage forbids direct SQL deletes, so check the delete/update policies are owner-scoped instead.
select is(
  (select string_agg(policyname, ',' order by policyname)::text from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and cmd in ('DELETE', 'UPDATE')
       and (coalesce(qual, '') || coalesce(with_check, '')) collate "C" like '%''signatures''%'),
  'signatures_delete'::text, 'the only delete/update policy on signatures is the owner delete');
select ok((select qual from pg_policies where policyname = 'signatures_delete') like '%(storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text%',
  'signature deletes are limited to the owner''s folder');

select * from finish();
rollback;
