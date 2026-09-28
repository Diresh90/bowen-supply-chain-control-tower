-- Idempotent historical market-rate import. Run AFTER 20260928040000_add_historical_freight_rates.sql.
-- It writes only to freight_rates, never freight_bookings. Locations are looked up, not created.
with source(origin_code, rate_month, usd_rate, usd_to_aud) as (values
  ('CNNJG','2025-01-01'::date,2163::numeric,1.606062::numeric),('CNNJG','2025-02-01',2250,1.586317),('CNNJG','2025-03-01',2200,1.588959),('CNNJG','2025-04-01',2225,1.590766),
  ('CNNJG','2025-05-01',2100,1.553224),('CNNJG','2025-06-01',2050,1.537669),('CNNJG','2025-07-01',2000,1.527576),('CNNJG','2025-08-01',2050,1.539030),
  ('CNNJG','2025-09-01',2608,1.517778),('CNNJG','2025-10-01',2900,1.529085),('CNNJG','2025-11-01',2500,1.537319),('CNNJG','2025-12-01',2500,1.504239),
  ('CNNJG','2026-01-01',1975,1.475512),('CNNJG','2026-02-01',1900,1.417203),('CNNJG','2026-03-01',2200,1.425767),('CNNJG','2026-04-01',2300,1.411279),
  ('CNSHA','2025-01-01',2600,1.606062),('CNSHA','2025-02-01',2450,1.586317),('CNSHA','2025-03-01',2300,1.588959),('CNSHA','2025-04-01',2375,1.590766),
  ('CNSHA','2025-05-01',2300,1.553224),('CNSHA','2025-06-01',2250,1.537669),('CNSHA','2025-07-01',2200,1.527576),('CNSHA','2025-08-01',2250,1.539030),
  ('CNSHA','2025-09-01',2350,1.517778),('CNSHA','2025-10-01',2550,1.529085),('CNSHA','2025-11-01',2500,1.537319),('CNSHA','2025-12-01',2500,1.504239),
  ('CNSHA','2026-01-01',2200,1.475512),('CNSHA','2026-02-01',2100,1.417203),('CNSHA','2026-03-01',2300,1.425767),('CNSHA','2026-04-01',2400,1.411279),
  ('NSA','2025-01-01',2381,1.606062),('NSA','2025-02-01',2541,1.586317),('NSA','2025-03-01',2832,1.588959),('NSA','2025-04-01',2817,1.590766),
  ('NSA','2025-05-01',1833,1.553224),('NSA','2025-06-01',1815,1.537669),('NSA','2025-07-01',1865,1.527576),('NSA','2025-08-01',2213,1.539030),
  ('NSA','2025-09-01',2150,1.517778),('NSA','2025-10-01',2007,1.529085),('NSA','2025-11-01',2009,1.537319),('NSA','2025-12-01',2073,1.504239),
  ('NSA','2026-01-01',1965,1.475512),('NSA','2026-02-01',2212.5,1.417203),('NSA','2026-03-01',2200,1.425767),('NSA','2026-04-01',2400,1.411279)
), mapped as (
  select source.*,
    (select id from public.locations where lower(name) = case source.origin_code when 'CNNJG' then 'nanjing' when 'CNSHA' then 'shanghai' else 'nhava sheva / jnpt' end
      and lower(country) = case when source.origin_code = 'NSA' then 'india' else 'china' end limit 1) as location_id
  from source
)
insert into public.freight_rates (
  rate_month, origin_location_id, origin_code, destination_location_id, container_type,
  sea_freight_rate_original, original_currency, fx_rate_to_aud, local_charges_aud,
  freight_forwarder_id, source_reference, notes
)
select rate_month, location_id, origin_code, null, null, usd_rate, 'USD', usd_to_aud, null, null,
  'Bowen historical monthly average', 'Historical average sea freight rate; FX convention 1 USD = X AUD.'
from mapped
on conflict (rate_month, origin_code, (coalesce(destination_location_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(container_type, '')), original_currency)
do update set
  origin_location_id = coalesce(excluded.origin_location_id, public.freight_rates.origin_location_id),
  sea_freight_rate_original = excluded.sea_freight_rate_original,
  fx_rate_to_aud = excluded.fx_rate_to_aud,
  source_reference = excluded.source_reference,
  notes = excluded.notes,
  updated_at = now();
