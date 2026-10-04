begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

\ir fixtures.psql

-- Pages for the draft d1 (2 pages) and the in-progress d2 (1 page).
insert into public.document_pages (document_id, page_number, width_pt, height_pt)
values ('d0000000-0000-4000-8000-0000000000d1', 1, 612, 792),
       ('d0000000-0000-4000-8000-0000000000d1', 2, 792, 612),
       ('d0000000-0000-4000-8000-0000000000d2', 1, 612, 792);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.recipient(p_doc text, p_email text) returns uuid language sql as $$
  select id from public.document_recipients where document_id = p_doc::uuid and email = p_email;
$$;
create function pg_temp.f(p_id text, p_recipient uuid, p_page int, p_x numeric, p_type text default 'signature')
returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'recipient_id', p_recipient, 'page_number', p_page, 'type', p_type,
    'x', p_x, 'y', 0.5, 'width', 0.3, 'height', 0.05, 'required', true, 'properties', '{}'::jsonb);
$$;

set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');

-- Placeholder recipient ------------------------------------------------------------------------
select lives_ok($$ insert into public.document_recipients (id, document_id, name, role, signing_order)
  values ('77777777-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000d1', 'Signer 2', 'signer', 2) $$,
  'owner adds a placeholder recipient without an email to a draft');

-- Save -----------------------------------------------------------------------------------------
select is(public.save_document_fields('d0000000-0000-4000-8000-0000000000d1', jsonb_build_array(
    pg_temp.f('f1000000-0000-4000-8000-000000000001', pg_temp.recipient('d0000000-0000-4000-8000-0000000000d1', 'b@test.local'), 1, 0.1),
    pg_temp.f('f1000000-0000-4000-8000-000000000002', '77777777-0000-4000-8000-000000000001', 2, 0.2, 'initials'),
    pg_temp.f('f1000000-0000-4000-8000-000000000003', '77777777-0000-4000-8000-000000000001', 2, 0.6, 'date_signed'))),
  3, 'owner saves three fields on the draft');
select results_eq($$ select x::float8 from public.document_fields where id = 'f1000000-0000-4000-8000-000000000002' $$,
  array[0.2::float8], 'geometry is stored as sent');

select is(public.save_document_fields('d0000000-0000-4000-8000-0000000000d1', jsonb_build_array(
    pg_temp.f('f1000000-0000-4000-8000-000000000001', pg_temp.recipient('d0000000-0000-4000-8000-0000000000d1', 'b@test.local'), 1, 0.15),
    pg_temp.f('f1000000-0000-4000-8000-000000000003', '77777777-0000-4000-8000-000000000001', 1, 0.6, 'date_signed'))),
  2, 'saving again replaces the set: missing fields are deleted');
select results_eq($$ select page_number, x::float8 from public.document_fields where id = 'f1000000-0000-4000-8000-000000000003' $$,
  $$ values (1, 0.6::float8) $$, 'moved fields are updated in place');
select results_eq($$ select x::float8 from public.document_fields where id = 'f1000000-0000-4000-8000-000000000001' $$,
  array[0.15::float8], 'changed geometry is saved');

select throws_ok($$ select public.save_document_fields('d0000000-0000-4000-8000-0000000000d1', jsonb_build_array(
    pg_temp.f('f1000000-0000-4000-8000-000000000009', '77777777-0000-4000-8000-000000000001', 3, 0.1))) $$,
  '23503', null, 'a field on a page that does not exist is rejected');
select throws_ok($$ select public.save_document_fields('d0000000-0000-4000-8000-0000000000d1', jsonb_build_array(
    pg_temp.f('f1000000-0000-4000-8000-000000000009', pg_temp.recipient('d0000000-0000-4000-8000-0000000000d2', 'c@test.local'), 1, 0.1))) $$,
  '23503', null, 'a recipient from another document is rejected');
select throws_ok($$ select public.save_document_fields('d0000000-0000-4000-8000-0000000000d1', jsonb_build_array(
    pg_temp.f('f1000000-0000-4000-8000-000000000009', '77777777-0000-4000-8000-000000000001', 1, 0.9))) $$,
  '23514', null, 'a field extending past the page edge is rejected');
select throws_ok($$ select public.save_document_fields('d0000000-0000-4000-8000-0000000000d1', '{}'::jsonb) $$,
  '22023', null, 'p_fields must be an array');
select results_eq($$ select count(*)::int from public.document_fields where document_id = 'd0000000-0000-4000-8000-0000000000d1' $$,
  array[2], 'failed saves change nothing');

select throws_ok($$ update public.document_fields set type = 'text' where id = 'f1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a field''s type cannot be changed (column privileges)');

-- Locked after sending ---------------------------------------------------------------------------
select throws_ok($$ select public.save_document_fields('d0000000-0000-4000-8000-0000000000d2', '[]'::jsonb) $$,
  '42501', null, 'fields of a sent document cannot be edited');
reset role;
insert into public.document_fields (id, document_id, recipient_id, page_number, type, x, y, width, height)
values ('f2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-0000000000d2',
        (select id from public.document_recipients where document_id = 'd0000000-0000-4000-8000-0000000000d2' and email = 'b@test.local'),
        1, 'signature', 0.1, 0.1, 0.3, 0.05),
       ('f2000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000d2',
        (select id from public.document_recipients where document_id = 'd0000000-0000-4000-8000-0000000000d2' and email = 'c@test.local'),
        1, 'signature', 0.1, 0.5, 0.3, 0.05);
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
delete from public.document_fields where id = 'f2000000-0000-4000-8000-000000000001';
select results_eq($$ select count(*)::int from public.document_fields where document_id = 'd0000000-0000-4000-8000-0000000000d2' $$,
  array[2], 'owner cannot delete fields of a sent document');

-- Visibility ------------------------------------------------------------------------------------
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select results_eq($$ select id::text from public.document_fields order by id $$,
  array['f2000000-0000-4000-8000-000000000001'], 'active signer B sees only their own fields of sent documents');
select throws_ok($$ select public.save_document_fields('d0000000-0000-4000-8000-0000000000d1', '[]'::jsonb) $$,
  '42501', null, 'a recipient cannot edit the owner''s draft');
select pg_temp.as_user('cccccccc-0000-4000-8000-000000000003');
select is_empty($$ select 1 from public.document_fields $$, 'pending signer C sees no fields yet');
select pg_temp.as_user('eeeeeeee-0000-4000-8000-000000000005');
select is_empty($$ select 1 from public.document_fields $$, 'strangers see no fields');
select throws_ok($$ insert into public.document_fields (document_id, recipient_id, page_number, type, x, y, width, height)
  values ('d0000000-0000-4000-8000-0000000000d1', '77777777-0000-4000-8000-000000000001', 1, 'text', 0.1, 0.1, 0.1, 0.1) $$,
  '42501', null, 'strangers cannot insert fields');

select * from finish();
rollback;
