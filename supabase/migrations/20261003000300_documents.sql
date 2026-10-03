-- Documents, recipients, per-user library state (SPEC §8). Later phases populate the
-- file/send/completion columns; they exist now so the schema matches the spec.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  title text not null check (length(title) between 1 and 200),
  status public.document_status not null default 'draft',
  original_path text,
  completed_path text,
  certificate_path text,
  original_sha256 text,
  completed_sha256 text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  page_count int check (page_count is null or page_count > 0),
  current_signing_order int check (current_signing_order is null or current_signing_order >= 1),
  email_subject text check (email_subject is null or length(email_subject) <= 200),
  email_message text check (email_message is null or length(email_message) <= 2000),
  expires_at timestamptz,
  reminder_first_after_days int check (reminder_first_after_days is null or reminder_first_after_days between 1 and 60),
  reminder_repeat_every_days int check (reminder_repeat_every_days is null or reminder_repeat_every_days between 1 and 60),
  require_email_otp boolean not null default false,
  allow_decline boolean not null default true,
  sent_at timestamptz,
  completed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create table public.document_recipients (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid references public.profiles (id),
  name text not null check (length(name) between 1 and 120),
  email extensions.citext not null check (length(email) between 3 and 254),
  role public.recipient_role not null default 'signer',
  signing_order int not null default 1 check (signing_order >= 1),
  status public.recipient_status not null default 'pending',
  sent_at timestamptz,
  viewed_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, email)
);

create table public.document_user_state (
  document_id uuid references public.documents (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  hidden_at timestamptz,
  last_opened_at timestamptz,
  primary key (document_id, user_id)
);

create index documents_owner_status_updated_idx on public.documents (owner_id, status, updated_at desc);
create index documents_title_trgm_idx on public.documents using gin (title extensions.gin_trgm_ops);
create index document_recipients_user_idx on public.document_recipients (user_id);
create index document_recipients_email_lower_idx on public.document_recipients (lower(email::text));
create index document_recipients_doc_order_idx on public.document_recipients (document_id, signing_order);
create index document_recipients_name_trgm_idx on public.document_recipients using gin (name extensions.gin_trgm_ops);
create index document_recipients_email_trgm_idx on public.document_recipients using gin ((email::text) extensions.gin_trgm_ops);
create index document_user_state_user_idx on public.document_user_state (user_id);
