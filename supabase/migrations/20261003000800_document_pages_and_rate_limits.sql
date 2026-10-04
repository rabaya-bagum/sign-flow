-- Page geometry (SPEC §8, §8.1) and a fixed-window rate limiter for Edge Functions (SPEC §14).

create table public.document_pages (
  document_id uuid not null references public.documents (id) on delete cascade,
  page_number int not null check (page_number >= 1),
  -- Visible box (CropBox ∩ MediaBox) as displayed, i.e. after applying /Rotate.
  width_pt numeric not null check (width_pt > 0),
  height_pt numeric not null check (height_pt > 0),
  -- Lower-left corner of the visible box in unrotated PDF user space.
  box_x_pt numeric not null default 0,
  box_y_pt numeric not null default 0,
  rotation int not null default 0 check (rotation in (0, 90, 180, 270)),
  primary key (document_id, page_number)
);

alter table public.document_pages enable row level security;
revoke all on public.document_pages from anon, authenticated;
grant select on public.document_pages to authenticated;

create policy document_pages_select on public.document_pages
  for select to authenticated
  using (public.is_document_owner(document_id) or public.is_active_participant(document_id));

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Atomically counts a hit for `p_key` and reports whether it is within `p_max` per window.
create function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start
        end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- Records a processed original in one transaction (called by the process-upload Edge Function).
-- Refuses if another request already finalized this document, which keeps processing idempotent.
create function public.finalize_original_upload(
  p_document_id uuid,
  p_path text,
  p_sha256 text,
  p_size_bytes bigint,
  p_pages jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated int;
begin
  update public.documents
  set original_path = p_path,
      original_sha256 = p_sha256,
      file_size_bytes = p_size_bytes,
      page_count = jsonb_array_length(p_pages)
  where id = p_document_id
    and status = 'draft'
    and deleted_at is null
    and original_path is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  delete from public.document_pages where document_id = p_document_id;
  insert into public.document_pages (document_id, page_number, width_pt, height_pt, box_x_pt, box_y_pt, rotation)
  select p_document_id,
         (p ->> 'page_number')::int,
         (p ->> 'width_pt')::numeric,
         (p ->> 'height_pt')::numeric,
         (p ->> 'box_x_pt')::numeric,
         (p ->> 'box_y_pt')::numeric,
         (p ->> 'rotation')::int
  from jsonb_array_elements(p_pages) as p;
  return true;
end;
$$;

revoke execute on function public.finalize_original_upload(uuid, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_original_upload(uuid, text, text, bigint, jsonb) to service_role;
