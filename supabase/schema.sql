-- Fong Shann HR System - Supabase schema
-- Run in Supabase SQL Editor

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.hr_employee_schemas (
  factory_id text primary key check (factory_id in ('factory1', 'factory3')),
  columns text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_employees (
  id bigserial primary key,
  factory_id text not null check (factory_id in ('factory1', 'factory3')),
  employee_id text not null,
  order_no integer not null default 0,
  first_name text not null default '',
  last_name text not null default '',
  department text not null default '',
  position text not null default '',
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (factory_id, employee_id)
);

create index if not exists hr_employees_factory_order_idx
  on public.hr_employees (factory_id, order_no, employee_id);

create table if not exists public.hr_scan_events (
  id bigserial primary key,
  factory_id text not null check (factory_id in ('factory1', 'factory3')),
  machine_code text not null,
  scanned_at timestamptz not null,
  employee_id text not null,
  scan_type smallint not null check (scan_type in (1, 2)),
  created_at timestamptz not null default now(),
  unique (factory_id, machine_code, scanned_at, employee_id, scan_type)
);

create index if not exists hr_scan_events_factory_time_idx
  on public.hr_scan_events (factory_id, scanned_at);

create index if not exists hr_scan_events_factory_employee_time_idx
  on public.hr_scan_events (factory_id, employee_id, scanned_at);

create table if not exists public.hr_ot_daily (
  id bigserial primary key,
  factory_id text not null check (factory_id in ('factory1', 'factory3')),
  work_date date not null,
  employee_id text not null,
  employee_name text not null default '',
  department text not null default '',
  position text not null default '',
  shift_code text not null check (shift_code in ('day', 'office', 'transport10', 'transport12', 'night')),
  is_sunday boolean not null default false,
  entered_at timestamptz not null,
  exited_at timestamptz not null,
  ot1_before numeric(10,2) not null default 0,
  ot1_after numeric(10,2) not null default 0,
  ot2_before numeric(10,2) not null default 0,
  ot2_after numeric(10,2) not null default 0,
  ot3_before numeric(10,2) not null default 0,
  ot3_after numeric(10,2) not null default 0,
  total_ot_before numeric(10,2) not null default 0,
  total_ot_after numeric(10,2) not null default 0,
  ot1 numeric(10,2) not null default 0,
  ot2 numeric(10,2) not null default 0,
  ot3 numeric(10,2) not null default 0,
  total_ot numeric(10,2) not null default 0,
  ot_request_status text not null default 'unsubmitted',
  ot1_after_request numeric(10,2) not null default 0,
  ot2_after_request numeric(10,2) not null default 0,
  ot3_after_request numeric(10,2) not null default 0,
  ot_pay numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (factory_id, work_date, employee_id, entered_at, exited_at)
);

alter table public.hr_ot_daily
  add column if not exists ot1_before numeric(10,2) not null default 0,
  add column if not exists ot1_after numeric(10,2) not null default 0,
  add column if not exists ot2_before numeric(10,2) not null default 0,
  add column if not exists ot2_after numeric(10,2) not null default 0,
  add column if not exists ot3_before numeric(10,2) not null default 0,
  add column if not exists ot3_after numeric(10,2) not null default 0,
  add column if not exists total_ot_before numeric(10,2) not null default 0,
  add column if not exists total_ot_after numeric(10,2) not null default 0,
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

create table if not exists public.hr_ot_request_logs (
  id bigserial primary key,
  batch_id bigint not null references public.hr_ot_request_batches(id) on delete cascade,
  factory_id text not null check (factory_id in ('factory1', 'factory3')),
  period_no smallint not null check (period_no in (1, 2)),
  period_month smallint not null check (period_month between 1 and 12),
  period_year integer not null,
  request_date date not null,
  employee_id text,
  employee_name text not null default '',
  department text not null default '',
  request_time_label text not null default '',
  requested_hours numeric(10,2) not null default 0,
  approved_ot1 numeric(10,2) not null default 0,
  approved_ot2 numeric(10,2) not null default 0,
  approved_ot3 numeric(10,2) not null default 0,
  approved_total numeric(10,2) not null default 0,
  request_status text not null default 'unsubmitted',
  uploader_username text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_ot_request_logs_factory_period_idx
  on public.hr_ot_request_logs (factory_id, period_year, period_month, period_no, request_date);

create index if not exists hr_ot_request_logs_batch_idx
  on public.hr_ot_request_logs (batch_id);

create index if not exists hr_ot_daily_factory_workdate_idx
  on public.hr_ot_daily (factory_id, work_date);

create index if not exists hr_ot_daily_factory_employee_workdate_idx
  on public.hr_ot_daily (factory_id, employee_id, work_date);

create table if not exists public.hr_wages (
  id bigserial primary key,
  factory_id text not null check (factory_id in ('factory1', 'factory3')),
  pay_date date not null,
  period_no smallint not null check (period_no in (1, 2)),
  period_month smallint not null check (period_month between 1 and 12),
  period_year integer not null,
  period_start date not null,
  period_end date not null,
  employee_id text not null,
  seq_no integer not null default 0,
  row_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (factory_id, pay_date, employee_id)
);

create index if not exists hr_wages_factory_paydate_seq_idx
  on public.hr_wages (factory_id, pay_date, seq_no);

drop trigger if exists trg_hr_employee_schemas_updated_at on public.hr_employee_schemas;
create trigger trg_hr_employee_schemas_updated_at
before update on public.hr_employee_schemas
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_hr_employees_updated_at on public.hr_employees;
create trigger trg_hr_employees_updated_at
before update on public.hr_employees
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_hr_ot_daily_updated_at on public.hr_ot_daily;
create trigger trg_hr_ot_daily_updated_at
before update on public.hr_ot_daily
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_hr_ot_request_batches_updated_at on public.hr_ot_request_batches;
create trigger trg_hr_ot_request_batches_updated_at
before update on public.hr_ot_request_batches
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_hr_ot_request_entries_updated_at on public.hr_ot_request_entries;
create trigger trg_hr_ot_request_entries_updated_at
before update on public.hr_ot_request_entries
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_hr_ot_request_logs_updated_at on public.hr_ot_request_logs;
create trigger trg_hr_ot_request_logs_updated_at
before update on public.hr_ot_request_logs
for each row execute function public.set_row_updated_at();

drop trigger if exists trg_hr_wages_updated_at on public.hr_wages;
create trigger trg_hr_wages_updated_at
before update on public.hr_wages
for each row execute function public.set_row_updated_at();
