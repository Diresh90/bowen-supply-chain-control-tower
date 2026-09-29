-- Migration 1: additive authentication structure only.
-- This migration does not alter operational tables or their existing RLS policies.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on update cascade on delete cascade,
  full_name text,
  email text,
  role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_role_check check (role in ('admin', 'read_only'))
);

create unique index if not exists user_profiles_email_lower_key
  on public.user_profiles (lower(email))
  where email is not null;

create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_user_profiles_updated_at();

-- SECURITY DEFINER helpers are intended for the staged operational policies in Migration 2.
-- They avoid recursive user_profiles policy checks and return false for missing/inactive profiles.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and active = true
  );
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.user_profiles
  where id = auth.uid() and active = true;
$$;

revoke all on function public.is_active_user() from public;
revoke all on function public.current_user_role() from public;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.current_user_role() to authenticated;

grant select on public.user_profiles to authenticated;
revoke insert, update, delete on public.user_profiles from anon, authenticated;

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_read_own" on public.user_profiles;
create policy "user_profiles_read_own"
on public.user_profiles
for select
to authenticated
using (id = auth.uid());

comment on table public.user_profiles is
  'Application access profiles linked to Supabase Auth. Passwords remain in Supabase Auth.';
