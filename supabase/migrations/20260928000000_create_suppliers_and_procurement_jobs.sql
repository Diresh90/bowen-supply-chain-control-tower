create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  contact_name text,
  email text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.procurement_jobs (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  sales_order_number text,
  supplier_po_number text,
  supplier_id uuid references public.suppliers (id),
  project_manager text,
  required_onsite_date date,
  total_containers integer,
  status text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint procurement_jobs_status_check check (
    status in (
      'Awaiting Confirmation',
      'Confirmed',
      'In Production',
      'Production Completed',
      'Fully Dispatched'
    )
  )
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row
execute function public.set_updated_at();

create trigger procurement_jobs_set_updated_at
before update on public.procurement_jobs
for each row
execute function public.set_updated_at();
