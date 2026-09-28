-- Phase 1: approved suppliers and procurement jobs.
-- This migration is idempotent and may also be pasted in full into Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  contact_name text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procurement_jobs (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  sales_order_number text,
  supplier_po_number text,
  supplier_id uuid references public.suppliers(id) on update cascade on delete restrict,
  project_manager text,
  required_onsite_date date,
  total_containers integer check (total_containers is null or total_containers >= 0),
  status text check (status is null or status in (
    'Awaiting Confirmation',
    'Confirmed',
    'In Production',
    'Production Completed',
    'Fully Dispatched'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists procurement_jobs_set_updated_at on public.procurement_jobs;
create trigger procurement_jobs_set_updated_at before update on public.procurement_jobs
for each row execute function public.set_updated_at();

create index if not exists procurement_jobs_supplier_id_idx on public.procurement_jobs(supplier_id);

alter table public.suppliers enable row level security;
alter table public.procurement_jobs enable row level security;

-- Phase 1 has no user authentication. These policies permit the project's anon key
-- to operate the internal control tower. Replace them with authenticated-role policies
-- before making the application publicly accessible.
drop policy if exists "phase1_suppliers_select" on public.suppliers;
create policy "phase1_suppliers_select" on public.suppliers for select to anon, authenticated using (true);
drop policy if exists "phase1_suppliers_insert" on public.suppliers;
create policy "phase1_suppliers_insert" on public.suppliers for insert to anon, authenticated with check (true);
drop policy if exists "phase1_suppliers_update" on public.suppliers;
create policy "phase1_suppliers_update" on public.suppliers for update to anon, authenticated using (true) with check (true);
drop policy if exists "phase1_suppliers_delete" on public.suppliers;
create policy "phase1_suppliers_delete" on public.suppliers for delete to anon, authenticated using (true);

drop policy if exists "phase1_jobs_select" on public.procurement_jobs;
create policy "phase1_jobs_select" on public.procurement_jobs for select to anon, authenticated using (true);
drop policy if exists "phase1_jobs_insert" on public.procurement_jobs;
create policy "phase1_jobs_insert" on public.procurement_jobs for insert to anon, authenticated with check (true);
drop policy if exists "phase1_jobs_update" on public.procurement_jobs;
create policy "phase1_jobs_update" on public.procurement_jobs for update to anon, authenticated using (true) with check (true);
drop policy if exists "phase1_jobs_delete" on public.procurement_jobs;
create policy "phase1_jobs_delete" on public.procurement_jobs for delete to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.suppliers to anon, authenticated;
grant select, insert, update, delete on public.procurement_jobs to anon, authenticated;
