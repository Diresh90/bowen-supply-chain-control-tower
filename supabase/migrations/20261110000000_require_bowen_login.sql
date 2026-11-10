-- Require a signed-in Bowen user for all app data (run at go-live of the login feature).
-- Data is not touched: only access rules change.
--
-- Before: every table allowed the public "anon" key to read, add, change and delete rows.
-- After:  only signed-in users whose email ends in @bowenstorage.com.au can, and the anon
--         key (which is visible in the website's code) can no longer read or change anything.
--
-- Accounts are created by an administrator in Supabase -> Authentication -> Users
-- (public sign-up is switched off in Authentication settings).

create or replace function public.is_bowen_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@bowenstorage.com.au', false);
$$;

do $$
declare
  t text;
  p record;
  -- table -> operations the app is allowed (mirrors the previous grants)
  rules constant jsonb := '{
    "suppliers": ["select","insert","update","delete"],
    "procurement_jobs": ["select","insert","update","delete"],
    "production_stages": ["select","insert","update","delete"],
    "supplier_production_settings": ["select","insert","update"],
    "supplier_capacity_overrides": ["select","insert","update","delete"],
    "freight_forwarders": ["select","insert","update"],
    "locations": ["select","insert","update"],
    "freight_references": ["select","insert","update"],
    "freight_bookings": ["select","insert","update"],
    "freight_rates": ["select","insert","update","delete"]
  }';
  op text;
begin
  for t in select jsonb_object_keys(rules) loop
    -- Remove the old open policies on this table.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    -- The anon key loses all access; signed-in users keep the same operations as before.
    execute format('revoke all on public.%I from anon', t);

    for op in select jsonb_array_elements_text(rules -> t) loop
      if op = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated with check (public.is_bowen_user())', 'bowen_' || t || '_insert', t);
      elsif op = 'update' then
        execute format('create policy %I on public.%I for update to authenticated using (public.is_bowen_user()) with check (public.is_bowen_user())', 'bowen_' || t || '_update', t);
      else
        execute format('create policy %I on public.%I for %s to authenticated using (public.is_bowen_user())', 'bowen_' || t || '_' || op, t, op);
      end if;
    end loop;
  end loop;
end $$;
