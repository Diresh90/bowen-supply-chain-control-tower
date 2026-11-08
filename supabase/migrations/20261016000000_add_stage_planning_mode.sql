-- Backward planning for production stages (additive only).
-- Run this complete file manually in Supabase SQL Editor.
-- Adds two optional columns. Existing rows, dates and constraints are not changed.
--
-- planning_mode
--   'backward' = project order: worked back from required_site_date using the
--                delivery, sea transit, dispatch and production durations.
--   'forward'  = stock order: worked forward from production_start.
--   NULL       = stage created before this migration (planned forward).
--
-- supplier_ready_date
--   The supplier's committed goods-ready date. For backward stages it drives the
--   forecast dates and the late / spare-days timing status.

alter table public.production_stages
  add column if not exists planning_mode text check (planning_mode in ('backward', 'forward')),
  add column if not exists supplier_ready_date date;
