-- Historical freight-rate storage (additive and idempotent).
-- Run manually in Supabase SQL Editor BEFORE the historical import.
-- This does not alter or remove freight bookings or any existing operational rows.
create table if not exists public.freight_rates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.freight_rates add column if not exists rate_month date;
alter table public.freight_rates add column if not exists id uuid default gen_random_uuid();
alter table public.freight_rates add column if not exists origin_location_id uuid references public.locations(id) on update cascade on delete restrict;
alter table public.freight_rates add column if not exists origin_code text;
alter table public.freight_rates add column if not exists destination_location_id uuid references public.locations(id) on update cascade on delete restrict;
alter table public.freight_rates add column if not exists container_type text;
alter table public.freight_rates add column if not exists sea_freight_rate_original numeric(16,4);
alter table public.freight_rates add column if not exists original_currency text;
alter table public.freight_rates add column if not exists fx_rate_to_aud numeric(18,8);
alter table public.freight_rates add column if not exists sea_freight_rate_aud numeric(16,2);
alter table public.freight_rates add column if not exists local_charges_aud numeric(16,2);
alter table public.freight_rates add column if not exists total_cost_aud numeric(16,2);
alter table public.freight_rates add column if not exists freight_forwarder_id uuid references public.freight_forwarders(id) on update cascade on delete restrict;
alter table public.freight_rates add column if not exists source_reference text;
alter table public.freight_rates add column if not exists notes text;
alter table public.freight_rates add column if not exists created_at timestamptz not null default now();
alter table public.freight_rates add column if not exists updated_at timestamptz not null default now();

create index if not exists freight_rates_month_idx on public.freight_rates(rate_month);
create index if not exists freight_rates_origin_idx on public.freight_rates(origin_code, origin_location_id);
create unique index if not exists freight_rates_natural_key_idx on public.freight_rates (
  rate_month,
  origin_code,
  coalesce(destination_location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(container_type, ''),
  original_currency
);

create or replace function public.calculate_historical_freight_rate()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.sea_freight_rate_original is not null and new.fx_rate_to_aud is not null then
    new.sea_freight_rate_aud := round(new.sea_freight_rate_original * new.fx_rate_to_aud, 2);
    new.total_cost_aud := round(new.sea_freight_rate_aud + coalesce(new.local_charges_aud, 0), 2);
  else
    new.sea_freight_rate_aud := null;
    new.total_cost_aud := null;
  end if;
  return new;
end; $$;

create or replace trigger freight_rates_calculate_aud before insert or update of sea_freight_rate_original, fx_rate_to_aud, local_charges_aud
on public.freight_rates for each row execute function public.calculate_historical_freight_rate();

create or replace trigger freight_rates_set_updated_at before update on public.freight_rates
for each row execute function public.set_updated_at();

alter table public.freight_rates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freight_rates' and policyname = 'freight_rates_select') then
    create policy freight_rates_select on public.freight_rates for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freight_rates' and policyname = 'freight_rates_insert') then
    create policy freight_rates_insert on public.freight_rates for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'freight_rates' and policyname = 'freight_rates_update') then
    create policy freight_rates_update on public.freight_rates for update to anon, authenticated using (true) with check (true);
  end if;
end $$;
grant select, insert, update on public.freight_rates to anon, authenticated;
