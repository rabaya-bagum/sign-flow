begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Fixture-based: per-viewer buckets (SPEC §6.3).
\ir fixtures.psql

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq($$ select needs_signature, waiting, drafts, completed from public.get_dashboard_summary() $$,
  $$ values (0::bigint, 1::bigint, 1::bigint, 1::bigint) $$, 'fixture owner summary');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq($$ select needs_signature, waiting, drafts, completed from public.get_dashboard_summary() $$,
  $$ values (1::bigint, 0::bigint, 0::bigint, 1::bigint) $$, 'fixture active signer summary');

-- Hidden documents drop out of listings and counts.
insert into public.document_user_state (document_id, user_id, hidden_at)
values ('d0000000-0000-4000-8000-0000000000d3', 'bbbbbbbb-0000-4000-8000-000000000002', now());
select results_eq($$ select completed from public.get_dashboard_summary() $$,
  $$ values (0::bigint) $$, 'hidden document is excluded from counts');

-- Seed-based: requires `supabase db reset` (seed.sql) before running.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select results_eq($$ select needs_signature, waiting, drafts, completed from public.get_dashboard_summary() $$,
  $$ values (1::bigint, 2::bigint, 1::bigint, 1::bigint) $$, 'seed owner (John Doe) summary');
select results_eq($$ select title from public.list_recent_documents(1) $$,
  array['Mutual NDA.pdf'], 'most recently updated seed document comes first');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select results_eq($$ select needs_signature, waiting, drafts, completed from public.get_dashboard_summary() $$,
  $$ values (1::bigint, 0::bigint, 1::bigint, 1::bigint) $$, 'seed recipient (Aaliyah Fatimah) summary');

select * from finish();
rollback;
