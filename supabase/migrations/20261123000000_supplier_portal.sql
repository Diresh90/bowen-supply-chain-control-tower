-- Read-only supplier portal (additive only). Existing tables, rows and Bowen access rules are unchanged.
--
-- Supplier staff sign in with their own company email. They get NO access to any table:
-- the existing rules only let @bowenstorage.com.au users read or change data.
-- Instead they can call one function, public.supplier_portal(), which returns just their own
-- supplier's dispatch plan with these fields only:
--   PO number, client / project name, stage name, containers, planned dispatch date,
--   dispatch status, destination, required on-site date, monthly capacity.
-- Freight costs, FX rates, local charges, sales order numbers, other suppliers' orders and
-- all other tables are never returned.

-- Which company email domains belong to which supplier. Managed by Bowen users only.
create table if not exists public.supplier_access_domains (
  domain text primary key check (domain = lower(domain) and position('@' in domain) = 0),
  supplier_id uuid not null references public.suppliers(id) on update cascade on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.supplier_access_domains enable row level security;
revoke all on public.supplier_access_domains from anon;
grant select, insert, update, delete on public.supplier_access_domains to authenticated;

drop policy if exists bowen_supplier_access_domains_select on public.supplier_access_domains;
create policy bowen_supplier_access_domains_select on public.supplier_access_domains for select to authenticated using (public.is_bowen_user());
drop policy if exists bowen_supplier_access_domains_insert on public.supplier_access_domains;
create policy bowen_supplier_access_domains_insert on public.supplier_access_domains for insert to authenticated with check (public.is_bowen_user());
drop policy if exists bowen_supplier_access_domains_update on public.supplier_access_domains;
create policy bowen_supplier_access_domains_update on public.supplier_access_domains for update to authenticated using (public.is_bowen_user()) with check (public.is_bowen_user());
drop policy if exists bowen_supplier_access_domains_delete on public.supplier_access_domains;
create policy bowen_supplier_access_domains_delete on public.supplier_access_domains for delete to authenticated using (public.is_bowen_user());

-- The supplier the signed-in user belongs to (by email domain), or null.
create or replace function public.current_supplier_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.supplier_id
    from public.supplier_access_domains d
   where d.domain = split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 2);
$$;

-- Everything the supplier page shows, limited to the caller's own supplier. Null if not a supplier user.
create or replace function public.supplier_portal()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.current_supplier_id() as supplier_id)
  select case when (select supplier_id from me) is null then null else jsonb_build_object(
    'supplier', (select jsonb_build_object('id', s.id, 'name', s.name) from public.suppliers s where s.id = (select supplier_id from me)),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ps.id,
               'supplier_id', ps.supplier_id,
               'stage_reference', ps.stage_reference,
               'container_quantity', ps.container_quantity,
               'goods_ready_date', ps.goods_ready_date,
               'destination', ps.destination,
               'required_site_date', ps.required_site_date,
               'dispatch_status', ps.dispatch_status,
               'tentative', ps.tentative,
               'procurement_jobs', jsonb_build_object(
                 'client_name', j.client_name,
                 'supplier_po_number', j.supplier_po_number,
                 'order_type', j.order_type,
                 'status', j.status
               )
             ) order by ps.goods_ready_date)
        from public.production_stages ps
        join public.procurement_jobs j on j.id = ps.procurement_job_id
       where ps.supplier_id = (select supplier_id from me)
    ), '[]'::jsonb),
    'capacity', coalesce((
      select jsonb_agg(jsonb_build_object('supplier_id', o.supplier_id, 'capacity_month', o.capacity_month, 'container_capacity', o.container_capacity))
        from public.supplier_capacity_overrides o
       where o.supplier_id = (select supplier_id from me)
    ), '[]'::jsonb)
  ) end;
$$;

revoke execute on function public.current_supplier_id() from public, anon;
revoke execute on function public.supplier_portal() from public, anon;
grant execute on function public.current_supplier_id() to authenticated;
grant execute on function public.supplier_portal() to authenticated;

-- Craftsman Automation staff (@craftsmanautomation.com) see Craftsman's plan.
insert into public.supplier_access_domains (domain, supplier_id)
select 'craftsmanautomation.com', s.id from public.suppliers s where s.name = 'Craftsman Automation'
on conflict (domain) do nothing;
