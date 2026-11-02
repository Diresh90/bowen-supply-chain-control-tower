-- Dispatch status and freight costs on production stages (additive only).
-- Run this complete file manually in Supabase SQL Editor.
-- Adds optional columns; existing rows and constraints are not changed.
--
-- dispatch_status: Tentative -> Confirmed -> Dispatched (left the supplier) -> Sailed -> Arrived (on site).
--   NULL on older stages; the app reads it from the tentative flag until the stage is next saved.
-- Freight is entered per 40ft container. Ocean freight and surcharges are USD; local charges are AUD.
-- usd_aud_rate converts the USD charges to AUD for spend reporting.

alter table public.production_stages
  add column if not exists dispatch_status text check (dispatch_status in ('Tentative', 'Confirmed', 'Dispatched', 'Sailed', 'Arrived')),
  add column if not exists ocean_freight_usd numeric(12, 2) check (ocean_freight_usd >= 0),
  add column if not exists peak_season_surcharge_usd numeric(12, 2) check (peak_season_surcharge_usd >= 0),
  add column if not exists other_surcharges_usd numeric(12, 2) check (other_surcharges_usd >= 0),
  add column if not exists local_charges_aud numeric(12, 2) check (local_charges_aud >= 0),
  add column if not exists usd_aud_rate numeric(10, 4) check (usd_aud_rate > 0);
