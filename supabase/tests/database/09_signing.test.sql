begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

\ir fixtures.psql

-- d2 (in progress): B signer order 1 (sent), C signer order 2 (pending), D cc.
insert into public.document_pages (document_id, page_number, width_pt, height_pt)
values ('d0000000-0000-4000-8000-0000000000d2', 1, 612, 792);
insert into public.document_fields (id, document_id, recipient_id, page_number, type, x, y, width, height, required, properties)
select f.id::uuid, 'd0000000-0000-4000-8000-0000000000d2', r.id, 1, f.type::public.field_type, 0.1, f.y, 0.2, 0.05, f.required, '{}'::jsonb
from (values
  ('f0000000-0000-4000-8000-0000000000b1', 'b@test.local', 'signature', 0.1, true),
  ('f0000000-0000-4000-8000-0000000000b2', 'b@test.local', 'text', 0.2, false),
  ('f0000000-0000-4000-8000-0000000000c1', 'c@test.local', 'signature', 0.3, true)
) as f(id, email, type, y, required)
join public.document_recipients r on r.document_id = 'd0000000-0000-4000-8000-0000000000d2' and r.email = f.email;

create temp table ids as
select
  (select id from public.document_recipients where document_id = 'd0000000-0000-4000-8000-0000000000d2' and email = 'b@test.local') as b,
  (select id from public.document_recipients where document_id = 'd0000000-0000-4000-8000-0000000000d2' and email = 'c@test.local') as c,
  (select id from public.document_recipients where document_id = 'd0000000-0000-4000-8000-0000000000d2' and email = 'd@test.local') as d;
grant select on ids to authenticated;

-- Clients can't call the state functions or write values -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.complete_recipient((select b from ids), '[]') $$, '42501', null,
  'a recipient cannot call complete_recipient directly');
select throws_ok($$ select public.decline_recipient((select b from ids), 'no') $$, '42501', null,
  'a recipient cannot call decline_recipient directly');
select throws_ok($$ select public.mark_document_completed('d0000000-0000-4000-8000-0000000000d2', 'x', 'y', repeat('a', 64)) $$,
  '42501', null, 'clients cannot complete documents');
select throws_ok($$ insert into public.field_values (field_id, document_id, recipient_id, value)
  values ('f0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000d2', (select b from ids), 'x') $$,
  '42501', null, 'clients cannot write field values');
select throws_ok($$ select * from public.recipient_otps $$, '42501', null, 'clients cannot read OTPs');
select throws_ok($$ select * from public.esign_consents $$, '42501', null, 'clients cannot read consents');
reset role;

-- Turn and completeness checks --------------------------------------------------------------------
select throws_ok($$ select public.complete_recipient((select c from ids), '[]') $$, 'SF030', null,
  'order 2 cannot sign while order 1 is active');
select throws_ok($$ select public.complete_recipient((select d from ids), '[]') $$, 'SF030', null,
  'a CC cannot sign');
select throws_ok($$ select public.complete_recipient((select b from ids), '[]') $$, 'SF032', 'Required fields are missing',
  'a required signature without an image is refused');
select throws_ok($$ select public.complete_recipient((select b from ids),
  '[{"field_id":"f0000000-0000-4000-8000-0000000000c1","asset_path":"x.png"}]') $$, 'SF032',
  'A value does not belong to this recipient', 'a value for someone else''s field is refused');
select throws_ok($$ select public.complete_recipient((select b from ids),
  '[{"field_id":"f0000000-0000-4000-8000-0000000000b1","asset_path":"a.png"},{"field_id":"f0000000-0000-4000-8000-0000000000b1","asset_path":"b.png"}]') $$,
  'SF032', 'Duplicate values', 'duplicate values are refused');

select ok(public.mark_recipient_viewed((select b from ids)), 'first open marks the recipient viewed');
select ok(not public.mark_recipient_viewed((select b from ids)), 'a second open changes nothing');

-- B signs: group 2 activates ----------------------------------------------------------------------
select is(
  public.complete_recipient((select b from ids),
    '[{"field_id":"f0000000-0000-4000-8000-0000000000b1","asset_path":"sig.png"},{"field_id":"f0000000-0000-4000-8000-0000000000b2","value":"Hello"}]'
  ) -> 'outcome', '"advanced"'::jsonb, 'the last signer of group 1 advances the document');
select results_eq(
  $$ select status::text, (select current_signing_order from public.documents where id = 'd0000000-0000-4000-8000-0000000000d2')
     from public.document_recipients where id = (select c from ids) $$,
  $$ values ('sent', 2) $$, 'group 2 is now active');
select throws_ok($$ select public.complete_recipient((select b from ids), '[]') $$, 'SF030', null,
  'a recipient cannot sign twice');

-- Visibility: C (now active) sees B's values and filled fields; a stranger sees nothing ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.field_values), 2, 'the next signer sees earlier values');
select is((select count(*)::int from public.document_fields where document_id = 'd0000000-0000-4000-8000-0000000000d2'), 3,
  'the next signer sees their own field and earlier filled fields');
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.field_values), 0, 'a stranger sees no values');
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.field_values where document_id = 'd0000000-0000-4000-8000-0000000000d2'), 0,
  'a CC sees nothing before completion');
reset role;

-- C signs: finalize -------------------------------------------------------------------------------
select is(
  public.complete_recipient((select c from ids), '[{"field_id":"f0000000-0000-4000-8000-0000000000c1","asset_path":"c.png"}]') -> 'outcome',
  '"finalize"'::jsonb, 'the last signer triggers finalization');
select throws_ok($$ select public.mark_document_completed('d0000000-0000-4000-8000-0000000000d2', 'c.pdf', 'cert.pdf', 'nothex') $$,
  'SF032', null, 'an invalid hash is refused');
select ok(public.mark_document_completed('d0000000-0000-4000-8000-0000000000d2', 'c.pdf', 'cert.pdf', repeat('a', 64)),
  'the document is completed');
select results_eq(
  $$ select d.status::text, r.status::text from public.documents d join public.document_recipients r on r.document_id = d.id
     where d.id = 'd0000000-0000-4000-8000-0000000000d2' and r.role = 'cc' $$,
  $$ values ('completed', 'sent') $$, 'completed, and the CC is notified');
select ok(not public.mark_document_completed('d0000000-0000-4000-8000-0000000000d2', 'c.pdf', 'cert.pdf', repeat('a', 64)),
  'completing twice is a no-op');

-- Decline -----------------------------------------------------------------------------------------
insert into public.documents (id, owner_id, title, status, current_signing_order, allow_decline)
values ('d0000000-0000-4000-8000-0000000000d4', 'aaaaaaaa-0000-4000-8000-000000000001', 'A decline', 'in_progress', 1, false);
insert into public.document_recipients (id, document_id, user_id, name, email, role, signing_order, status)
values ('e0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000d4', 'bbbbbbbb-0000-4000-8000-000000000002', 'User B', 'b@test.local', 'signer', 1, 'sent');
insert into public.recipient_access_tokens (recipient_id, token_hash, expires_at)
values ('e0000000-0000-4000-8000-0000000000e1', repeat('b', 64), now() + interval '1 day');

select throws_ok($$ select public.decline_recipient('e0000000-0000-4000-8000-0000000000e1', 'No thanks') $$, 'SF033', null,
  'declining is refused when the sender disabled it');
update public.documents set allow_decline = true where id = 'd0000000-0000-4000-8000-0000000000d4';
select public.decline_recipient('e0000000-0000-4000-8000-0000000000e1', '  Wrong amount  ');
select results_eq(
  $$ select d.status::text, r.status::text, r.decline_reason, (t.revoked_at is not null)
     from public.documents d join public.document_recipients r on r.document_id = d.id
     join public.recipient_access_tokens t on t.recipient_id = r.id
     where d.id = 'd0000000-0000-4000-8000-0000000000d4' $$,
  $$ values ('declined', 'declined', 'Wrong amount', true) $$,
  'declining ends the document, records the reason and revokes links');

select * from finish();
rollback;
