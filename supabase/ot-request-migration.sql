-- OT Request feature migration
-- Run this in Supabase SQL Editor

alter table public.hr_ot_daily
  add column if not exists ot_request_status text not null default 'unsubmitted',
  add column if not exists ot1_after_request numeric(10,2) not null default 0,
  add column if not exists ot2_after_request numeric(10,2) not null default 0,
  add column if not exists ot3_after_request numeric(10,2) not null default 0;

create table if not exists public.hr_ot_request_batches (
  id bigserial primary key,
  factory_id text not null check (factory_id in ('factory1', 'factory3')),
  period_no smallint not null check (period_no in (1, 2)),
  period_month smallint not null check (period_month between 1 and 12),
  period_year integer not null,
  uploader_username text not null default '',
  source_file_count integer not null default 0,
  extracted_entry_count integer not null default 0,
  unmatched_name_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_ot_request_batches_factory_period_idx
  on public.hr_ot_request_batches (factory_id, period_year, period_month, period_no, created_at);

create table if not exists public.hr_ot_request_entries (
  id bigserial primary key,
  batch_id bigint not null references public.hr_ot_request_batches(id) on delete cascade,
  factory_id text not null check (factory_id in ('factory1', 'factory3')),
  request_date date not null,
  sequence_no text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  extracted_name text not null default '',
  corrected_name text not null default '',
  employee_id text,
  work_time_label text not null default '',
  request_start_minute integer,
  request_end_minute integer,
  has_employee_signature boolean not null default false,
  has_supervisor_signature boolean not null default false,
  llm_source text not null default 'gemini',
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_ot_request_entries_factory_date_employee_idx
  on public.hr_ot_request_entries (factory_id, request_date, employee_id);

create index if not exists hr_ot_request_entries_batch_idx
  on public.hr_ot_request_entries (batch_id);

drop trigger if exists trg_hr_ot_request_batches_updated_at on public.hr_ot_request_batches;
create trigger trg_hr_ot_request_batches_updated_at
before update on public.hr_ot_request_batches
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_hr_ot_request_entries_updated_at on public.hr_ot_request_entries;
create trigger trg_hr_ot_request_entries_updated_at
before update on public.hr_ot_request_entries
for each row execute function public.set_row_updated_at();

