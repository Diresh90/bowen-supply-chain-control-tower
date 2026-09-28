-- Production planning (additive only).
-- Run this complete file manually in Supabase SQL Editor after the Phase 1 migration.
-- It does not update, delete, truncate, reseed, or recreate supplier/procurement data.

create table if not exists public.production_stages (
  id uuid primary key default gen_random_uuid(),
  procurement_job_id uuid not null references public.procurement_jobs(id) on update cascade on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on update cascade on delete restrict,
  stage_reference text not null check (length(trim(stage_reference)) > 0),
  container_quantity integer not null check (container_quantity > 0),
  priority text not null default 'Normal' check (priority in ('Critical', 'High', 'Normal', 'Low')),
  queue_sequence integer not null default 1 check (queue_sequence > 0),
  destination text,
  production_start date not null,
  production_duration_weeks integer not null default 1 check (production_duration_weeks >= 0),
  production_finish date not null,
  goods_ready_date date not null,
  dispatch_duration_weeks integer not null default 1 check (dispatch_duration_weeks >= 0),
  planned_etd date not null,
  transit_duration_weeks integer not null default 6 check (transit_duration_weeks >= 0),
  port_eta date not null,
  destination_duration_weeks integer not null default 1 check (destination_duration_weeks >= 0),
  forecast_site_eta date not null,
  required_site_date date not null,
  timing_status text not null,
  allocation_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_stages_procurement_job_id_idx on public.production_stages(procurement_job_id);
create index if not exists production_stages_supplier_id_idx on public.production_stages(supplier_id);
create index if not exists production_stages_queue_idx on public.production_stages(queue_sequence, production_start);

create or replace function public.validate_production_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_supplier uuid;
  parent_total integer;
  allocated integer;
begin
  -- Lock the parent so concurrent stage writes cannot over-allocate it.
  select supplier_id, total_containers
    into parent_supplier, parent_total
    from public.procurement_jobs
   where id = new.procurement_job_id
   for update;

  if parent_supplier is null or new.supplier_id <> parent_supplier then
    raise exception 'Production stage supplier must match its procurement job supplier';
  end if;

  select coalesce(sum(container_quantity), 0)
    into allocated
    from public.production_stages
   where procurement_job_id = new.procurement_job_id
     and id <> new.id;

  if parent_total is not null
     and allocated + new.container_quantity > parent_total
     and not new.allocation_override then
    raise exception 'Container allocation (%) exceeds procurement total (%). Confirm the allocation override to continue.', allocated + new.container_quantity, parent_total;
  end if;

  return new;
end;
$$;

drop trigger if exists production_stages_validate on public.production_stages;
create trigger production_stages_validate before insert or update on public.production_stages
for each row execute function public.validate_production_stage();

drop trigger if exists production_stages_set_updated_at on public.production_stages;
create trigger production_stages_set_updated_at before update on public.production_stages
for each row execute function public.set_updated_at();

alter table public.production_stages enable row level security;

drop policy if exists "production_stages_select" on public.production_stages;
create policy "production_stages_select" on public.production_stages for select to anon, authenticated using (true);
drop policy if exists "production_stages_insert" on public.production_stages;
create policy "production_stages_insert" on public.production_stages for insert to anon, authenticated with check (true);
drop policy if exists "production_stages_update" on public.production_stages;
create policy "production_stages_update" on public.production_stages for update to anon, authenticated using (true) with check (true);
drop policy if exists "production_stages_delete" on public.production_stages;
create policy "production_stages_delete" on public.production_stages for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.production_stages to anon, authenticated;
