-- Supplier production capacity (additive only).
-- Run this file manually in the Supabase SQL Editor after the production stages migration.
-- This migration does not alter, delete, truncate, or reseed any existing data.

create table if not exists public.supplier_production_settings (
  supplier_id uuid primary key references public.suppliers(id) on update cascade on delete restrict,
  default_monthly_capacity integer not null default 30 check (default_monthly_capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on update cascade on delete restrict,
  capacity_month date not null check (capacity_month = date_trunc('month', capacity_month)::date),
  container_capacity integer not null check (container_capacity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, capacity_month)
);

create index if not exists supplier_capacity_overrides_supplier_month_idx
  on public.supplier_capacity_overrides(supplier_id, capacity_month);

drop trigger if exists supplier_production_settings_set_updated_at on public.supplier_production_settings;
create trigger supplier_production_settings_set_updated_at before update on public.supplier_production_settings
for each row execute function public.set_updated_at();

drop trigger if exists supplier_capacity_overrides_set_updated_at on public.supplier_capacity_overrides;
create trigger supplier_capacity_overrides_set_updated_at before update on public.supplier_capacity_overrides
for each row execute function public.set_updated_at();

alter table public.supplier_production_settings enable row level security;
alter table public.supplier_capacity_overrides enable row level security;

drop policy if exists "supplier_production_settings_select" on public.supplier_production_settings;
create policy "supplier_production_settings_select" on public.supplier_production_settings for select to anon, authenticated using (true);
drop policy if exists "supplier_production_settings_insert" on public.supplier_production_settings;
create policy "supplier_production_settings_insert" on public.supplier_production_settings for insert to anon, authenticated with check (true);
drop policy if exists "supplier_production_settings_update" on public.supplier_production_settings;
create policy "supplier_production_settings_update" on public.supplier_production_settings for update to anon, authenticated using (true) with check (true);

drop policy if exists "supplier_capacity_overrides_select" on public.supplier_capacity_overrides;
create policy "supplier_capacity_overrides_select" on public.supplier_capacity_overrides for select to anon, authenticated using (true);
drop policy if exists "supplier_capacity_overrides_insert" on public.supplier_capacity_overrides;
create policy "supplier_capacity_overrides_insert" on public.supplier_capacity_overrides for insert to anon, authenticated with check (true);
drop policy if exists "supplier_capacity_overrides_update" on public.supplier_capacity_overrides;
create policy "supplier_capacity_overrides_update" on public.supplier_capacity_overrides for update to anon, authenticated using (true) with check (true);
drop policy if exists "supplier_capacity_overrides_delete" on public.supplier_capacity_overrides;
create policy "supplier_capacity_overrides_delete" on public.supplier_capacity_overrides for delete to anon, authenticated using (true);

grant select, insert, update on public.supplier_production_settings to anon, authenticated;
grant select, insert, update, delete on public.supplier_capacity_overrides to anon, authenticated;
