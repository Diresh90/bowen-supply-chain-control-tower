-- Freight planning (additive and idempotent). Run this complete file manually in Supabase SQL Editor.
-- No existing procurement, supplier, or production records are altered.
create table if not exists public.freight_forwarders (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(), name text not null, country text not null,
  location_type text not null check (location_type in ('Seaport','Inland Terminal','Other')),
  usage text not null default 'Both' check (usage in ('Origin','Destination','Both')),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (name, country)
);
create table if not exists public.freight_references (
  id uuid primary key default gen_random_uuid(),
  procurement_job_id uuid not null references public.procurement_jobs(id) on update cascade on delete restrict,
  production_stage_id uuid not null references public.production_stages(id) on update cascade on delete restrict,
  reference text not null check (length(trim(reference)) > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (production_stage_id, reference)
);
create table if not exists public.freight_bookings (
  id uuid primary key default gen_random_uuid(),
  procurement_job_id uuid not null references public.procurement_jobs(id) on update cascade on delete restrict,
  production_stage_id uuid not null references public.production_stages(id) on update cascade on delete restrict,
  freight_reference_id uuid not null references public.freight_references(id) on update cascade on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on update cascade on delete restrict,
  shipment_reference text not null check (length(trim(shipment_reference)) > 0), freight_po_number text,
  container_quantity integer not null check (container_quantity > 0), special_request text,
  origin_location_id uuid references public.locations(id) on update cascade on delete restrict,
  destination_location_id uuid references public.locations(id) on update cascade on delete restrict,
  freight_forwarder_id uuid references public.freight_forwarders(id) on update cascade on delete restrict,
  sea_freight_rate_aud numeric(14,2) not null default 0 check (sea_freight_rate_aud >= 0),
  local_charges_aud numeric(14,2) not null default 0 check (local_charges_aud >= 0),
  total_freight_cost_aud numeric(14,2) not null default 0 check (total_freight_cost_aud >= 0), total_cost_override boolean not null default false,
  planned_etd date, planned_eta date,
  status text not null default 'Not Planned' check (status in ('Not Planned','Pending Booking','Booking Confirmation','Dispatched','In Transit','Completed')),
  risk text not null default 'On Track' check (risk in ('On Track','Off Track')), comments text,
  allocation_override boolean not null default false, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists freight_references_job_idx on public.freight_references(procurement_job_id);
create index if not exists freight_references_stage_idx on public.freight_references(production_stage_id);
create index if not exists freight_bookings_job_idx on public.freight_bookings(procurement_job_id);
create index if not exists freight_bookings_stage_idx on public.freight_bookings(production_stage_id);
create index if not exists freight_bookings_reference_idx on public.freight_bookings(freight_reference_id);

create or replace function public.validate_freight_booking() returns trigger language plpgsql set search_path = '' as $$
declare stage_job uuid; stage_supplier uuid; stage_total integer; reference_job uuid; reference_stage uuid; allocated integer;
begin
  select procurement_job_id, supplier_id, container_quantity into stage_job, stage_supplier, stage_total
  from public.production_stages where id = new.production_stage_id for update;
  select procurement_job_id, production_stage_id into reference_job, reference_stage
  from public.freight_references where id = new.freight_reference_id;
  if stage_job is null or new.procurement_job_id <> stage_job or new.supplier_id <> stage_supplier then
    raise exception 'Freight booking job and supplier must match its production stage';
  end if;
  if reference_job <> stage_job or reference_stage <> new.production_stage_id then
    raise exception 'Freight reference must belong to the selected production stage';
  end if;
  select coalesce(sum(container_quantity),0) into allocated from public.freight_bookings
   where production_stage_id = new.production_stage_id and id <> new.id and archived_at is null;
  if new.archived_at is null and allocated + new.container_quantity > stage_total and not new.allocation_override then
    raise exception 'Freight allocation (%) exceeds production stage total (%). Confirm the allocation override to continue.', allocated + new.container_quantity, stage_total;
  end if;
  if not new.total_cost_override then new.total_freight_cost_aud := new.sea_freight_rate_aud + new.local_charges_aud; end if;
  return new;
end; $$;
drop trigger if exists freight_bookings_validate on public.freight_bookings;
create trigger freight_bookings_validate before insert or update on public.freight_bookings for each row execute function public.validate_freight_booking();
drop trigger if exists freight_forwarders_set_updated_at on public.freight_forwarders;
create trigger freight_forwarders_set_updated_at before update on public.freight_forwarders for each row execute function public.set_updated_at();
drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at before update on public.locations for each row execute function public.set_updated_at();
drop trigger if exists freight_references_set_updated_at on public.freight_references;
create trigger freight_references_set_updated_at before update on public.freight_references for each row execute function public.set_updated_at();
drop trigger if exists freight_bookings_set_updated_at on public.freight_bookings;
create trigger freight_bookings_set_updated_at before update on public.freight_bookings for each row execute function public.set_updated_at();

insert into public.freight_forwarders(name) values ('Kuehne + Nagel'),('Navia') on conflict (name) do nothing;
insert into public.locations(name,country,location_type,usage) values
 ('Nhava Sheva / JNPT','India','Seaport','Origin'),('Shanghai','China','Seaport','Origin'),('Nanjing','China','Other','Origin'),('Ningbo','China','Seaport','Origin'),
 ('Sydney','Australia','Seaport','Destination'),('Melbourne','Australia','Seaport','Destination'),('Brisbane','Australia','Seaport','Destination'),('Fremantle','Australia','Seaport','Destination'),
 ('Bell Bay','Australia','Seaport','Destination'),('Moorebank','Australia','Inland Terminal','Destination') on conflict (name,country) do nothing;

alter table public.freight_forwarders enable row level security; alter table public.locations enable row level security;
alter table public.freight_references enable row level security; alter table public.freight_bookings enable row level security;
do $$ declare t text; begin foreach t in array array['freight_forwarders','locations','freight_references','freight_bookings'] loop
  execute format('drop policy if exists %I on public.%I', t || '_select', t); execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_select', t);
  execute format('drop policy if exists %I on public.%I', t || '_insert', t); execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', t || '_insert', t);
  execute format('drop policy if exists %I on public.%I', t || '_update', t); execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', t || '_update', t);
end loop; end $$;
grant select,insert,update on public.freight_forwarders, public.locations, public.freight_references, public.freight_bookings to anon, authenticated;
