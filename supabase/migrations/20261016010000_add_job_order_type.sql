-- Order type on procurement jobs (additive only).
-- Run this complete file manually in Supabase SQL Editor.
-- Adds one optional column. Existing rows are not changed; jobs without a value
-- are treated as stock orders when their name contains "Stock Order", otherwise as project orders.

alter table public.procurement_jobs
  add column if not exists order_type text check (order_type in ('Project', 'Stock'));
