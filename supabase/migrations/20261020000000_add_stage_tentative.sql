-- Tentative production stages (additive only).
-- Run this complete file manually in Supabase SQL Editor.
-- Adds one column with a default; existing stages become "not tentative" (confirmed), as they are today.
--
-- A tentative stage has a planned dispatch date but is not yet confirmed. It shows on the
-- dispatch plan but does not count against supplier capacity until it is confirmed.

alter table public.production_stages
  add column if not exists tentative boolean not null default false;
