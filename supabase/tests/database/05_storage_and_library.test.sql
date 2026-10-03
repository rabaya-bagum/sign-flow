begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

\ir fixtures.psql

-- Fixture documents from fixtures.psql: d1 = A's draft (no file), d2 = A's in-progress, d3 = completed.
insert into public.documents (id, owner_id, title, status, original_path)
values ('d0000000-0000-4000-8000-0000000000d4', 'aaaaaaaa-0000-4000-8000-000000000001', 'A processed draft', 'draft',
        'aaaaaaaa-0000-4000-8000-000000000001/d0000000-0000-4000-8000-0000000000d4/original.pdf');
insert into public.document_pages (document_id, page_number, width_pt, height_pt)
values ('d0000000-0000-4000-8000-0000000000d4', 1, 612, 792);

-- Storage: documents bucket ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'aaaaaaaa-0000-4000-8000-000000000001/d0000000-0000-4000-8000-0000000000d1/original.pdf') $$,
  'owner can upload the original of their own unprocessed draft');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'aaaaaaaa-0000-4000-8000-000000000001/d0000000-0000-4000-8000-0000000000d1/other.pdf') $$,
  '42501', null, 'owner cannot write any other file name');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'aaaaaaaa-0000-4000-8000-000000000001/d0000000-0000-4000-8000-0000000000d4/original.pdf') $$,
  '42501', null, 'owner cannot overwrite a processed original');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'aaaaaaaa-0000-4000-8000-000000000001/d0000000-0000-4000-8000-0000000000d2/original.pdf') $$,
  '42501', null, 'owner cannot upload into a sent document');
select is_empty($$ select 1 from storage.objects where bucket_id = 'documents' $$,
  'clients cannot list or read the documents bucket, even their own files');
-- Storage forbids direct SQL deletes, so assert the policy set instead: the only client policy that
-- mentions the documents bucket is the insert policy (no select/update/delete for clients).
reset role;
select is(
  (select string_agg(policyname || ':' || cmd, ',' order by policyname)::text from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') || coalesce(with_check, '')) collate "C" like '%''documents''%'),
  'documents_insert_original:INSERT'::text,
  'clients have no read, update or delete policy on the documents bucket');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'aaaaaaaa-0000-4000-8000-000000000001/d0000000-0000-4000-8000-0000000000d1/original.pdf') $$,
  '42501', null, 'user B cannot write into user A''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('documents', 'bbbbbbbb-0000-4000-8000-000000000002/d0000000-0000-4000-8000-0000000000d1/original.pdf') $$,
  '42501', null, 'user B cannot attach a file to user A''s draft from their own folder');
select is_empty($$ select 1 from storage.objects where name like 'aaaaaaaa%' $$, 'user B cannot see user A''s objects');

-- Storage: uploads-tmp and avatars --------------------------------------------------------------
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('uploads-tmp', 'bbbbbbbb-0000-4000-8000-000000000002/scan-1.jpg') $$,
  'user can stage images in their own uploads-tmp folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('uploads-tmp', 'aaaaaaaa-0000-4000-8000-000000000001/scan-1.jpg') $$,
  '42501', null, 'user cannot stage images in another folder');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', 'bbbbbbbb-0000-4000-8000-000000000002/avatar.jpg') $$,
  'user can upload their own avatar');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', 'aaaaaaaa-0000-4000-8000-000000000001/avatar.jpg') $$,
  '42501', null, 'user cannot upload someone else''s avatar');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is_empty($$ select 1 from storage.objects where bucket_id = 'uploads-tmp' $$, 'staged images are private to their owner');
select results_eq($$ select count(*)::int from storage.objects where bucket_id = 'avatars' $$, array[1], 'avatars are readable by signed-in users');

-- document_pages ---------------------------------------------------------------------------------
select results_eq($$ select count(*)::int from public.document_pages where document_id = 'd0000000-0000-4000-8000-0000000000d4' $$,
  array[1], 'owner sees page geometry');
select throws_ok($$ insert into public.document_pages (document_id, page_number, width_pt, height_pt) values ('d0000000-0000-4000-8000-0000000000d1', 1, 1, 1) $$,
  '42501', null, 'clients cannot write page geometry');

-- Server-only functions --------------------------------------------------------------------------
select throws_ok($$ select public.check_rate_limit('x', 1, 60) $$, '42501', null, 'clients cannot call check_rate_limit');
select throws_ok($$ select public.finalize_original_upload('d0000000-0000-4000-8000-0000000000d1', 'p', 's', 1, '[]') $$,
  '42501', null, 'clients cannot call finalize_original_upload');

-- Audit triggers ---------------------------------------------------------------------------------
select lives_ok($$ insert into public.documents (id, owner_id, title) values ('d0000000-0000-4000-8000-0000000000d5', 'aaaaaaaa-0000-4000-8000-000000000001', 'Trigger test') $$,
  'owner creates a draft');
select lives_ok($$ update public.documents set title = 'Trigger test renamed' where id = 'd0000000-0000-4000-8000-0000000000d5' $$,
  'owner renames the draft');
select results_eq($$ select type::text, actor_user_id::text, metadata from public.document_events where document_id = 'd0000000-0000-4000-8000-0000000000d5' order by id $$,
  $$ values ('DOCUMENT_CREATED', 'aaaaaaaa-0000-4000-8000-000000000001', '{}'::jsonb),
            ('DOCUMENT_RENAMED', 'aaaaaaaa-0000-4000-8000-000000000001', '{"to": "Trigger test renamed", "from": "Trigger test"}'::jsonb) $$,
  'create and rename are audited with the actor');

-- Library RPCs -----------------------------------------------------------------------------------
select results_eq($$ select count(*)::int from public.list_documents('all', null, 'newest', '{}', null, null, 50) $$,
  array[5], 'owner lists all own documents');
select results_eq($$ select upload_incomplete from public.list_documents('all', 'A draft', 'newest', '{}', null, null, 50) $$,
  array[true], 'drafts without a processed file are flagged upload_incomplete');

reset role;
update public.documents set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000d5';
insert into public.document_user_state (document_id, user_id, hidden_at)
values ('d0000000-0000-4000-8000-0000000000d3', 'aaaaaaaa-0000-4000-8000-000000000001', now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is_empty($$ select 1 from public.list_documents('all', 'Trigger test', 'newest', '{}', null, null, 50) $$,
  'soft-deleted drafts disappear from lists');
select is_empty($$ select 1 from public.documents where id = 'd0000000-0000-4000-8000-0000000000d5' $$,
  'soft-deleted drafts disappear from direct reads');
select is_empty($$ select 1 from public.search_documents('Trigger test') $$, 'soft-deleted drafts disappear from search');
select is_empty($$ select 1 from public.list_documents('all', 'A completed', 'newest', '{}', null, null, 50) $$,
  'hidden documents disappear from lists');
select results_eq($$ select count(*)::int from public.documents where id = 'd0000000-0000-4000-8000-0000000000d3' $$,
  array[1], 'hidden documents stay reachable by direct link');

-- Leakage: strangers and other users' recipients -------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is_empty($$ select 1 from public.list_documents('all', null, 'newest', '{}', null, null, 50) $$, 'stranger lists nothing');
select is_empty($$ select 1 from public.search_documents('b@test.local') $$,
  'searching for another user''s recipient email returns nothing');
select is_empty($$ select 1 from public.list_documents('all', null, 'newest', '{"recipient": "User B"}', null, null, 50) $$,
  'recipient filter cannot reveal other users'' documents');

-- Seed: buckets agree with the dashboard; keyset pagination is complete and duplicate-free --------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select results_eq(
  $$ select (select count(*) from public.list_documents('needs_signature', null, 'newest', '{}', null, null, 50)),
            (select count(*) from public.list_documents('waiting', null, 'newest', '{}', null, null, 50)),
            (select count(*) from public.list_documents('draft', null, 'newest', '{}', null, null, 50)),
            (select count(*) from public.list_documents('completed', null, 'newest', '{}', null, null, 50)) $$,
  $$ select needs_signature, waiting, drafts, completed from public.get_dashboard_summary() $$,
  'seed owner: list buckets match dashboard counts');

select lives_ok($pag$
  do $$
  declare
    v_sort text;
    v_all uuid[];
    v_seen uuid[];
    v_page record;
    v_cursor_value text;
    v_cursor_id uuid;
    v_count int;
  begin
    foreach v_sort in array array['newest', 'oldest', 'title'] loop
      select array_agg(id) into v_all from public.list_documents('all', null, v_sort, '{}', null, null, 50);
      v_seen := '{}';
      v_cursor_value := null;
      v_cursor_id := null;
      loop
        v_count := 0;
        for v_page in select * from public.list_documents('all', null, v_sort, '{}', v_cursor_value, v_cursor_id, 2) loop
          v_seen := v_seen || v_page.id;
          v_cursor_value := v_page.cursor_value;
          v_cursor_id := v_page.id;
          v_count := v_count + 1;
        end loop;
        exit when v_count < 2;
      end loop;
      if v_seen is distinct from v_all then
        raise exception 'pagination mismatch for %: % vs %', v_sort, v_seen, v_all;
      end if;
    end loop;
  end
  $$;
$pag$, 'seed owner: 2-row pages return every row exactly once, in order, for every sort');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select results_eq(
  $$ select (select count(*) from public.list_documents('needs_signature', null, 'newest', '{}', null, null, 50)),
            (select count(*) from public.list_documents('waiting', null, 'newest', '{}', null, null, 50)),
            (select count(*) from public.list_documents('draft', null, 'newest', '{}', null, null, 50)),
            (select count(*) from public.list_documents('completed', null, 'newest', '{}', null, null, 50)) $$,
  $$ select needs_signature, waiting, drafts, completed from public.get_dashboard_summary() $$,
  'seed recipient: list buckets match dashboard counts');
select is_empty($$ select 1 from public.list_documents('all', 'Vendor', 'newest', '{}', null, null, 50) $$,
  'seed recipient cannot find the document where she is CC before completion');

reset role;
select results_eq($$ select public.check_rate_limit('pgtap', 2, 60), public.check_rate_limit('pgtap', 2, 60), public.check_rate_limit('pgtap', 2, 60) $$,
  $$ values (true, true, false) $$, 'rate limiter allows max hits per window');

select * from finish();
rollback;
