# Authentication rollout runbook

This rollout deliberately stops after **Migration 1**. It adds authentication structure but does not replace, remove, or tighten any operational-table policy. Apply the proposed Migration 2 only after Diresh has successfully signed in and all admin checks pass.

## 1. Migration 1

Filename: `supabase/migrations/20260929000000_add_auth_user_profiles.sql`

Run that file in the Supabase SQL Editor (or through the project's normal migration deployment process). Its exact SQL is the contents of that migration. It only creates `user_profiles`, its index/trigger, two role helper functions, grants, and profile-table RLS. It does not write to or change suppliers, procurement jobs, production, capacity, freight, rates, forwarders, locations, or containers.

## 2. Invite Diresh through Supabase Auth

1. Open the existing Supabase project; do **not** create a new project or reset its database.
2. Go to **Authentication → Users → Add user → Send invitation**.
3. Enter `diresh.desilva@bowenstorage.com.au` and send the invitation. Do not put a password in SQL.
4. Diresh follows the email flow and sets his password. If the dashboard offers “Create user” instead, create the same email and use Supabase's password/invitation workflow rather than storing a password anywhere in the application database.
5. In **Authentication → URL Configuration**, set the production Vercel URL as **Site URL** and add the production URL plus local development URLs to **Redirect URLs** (for example `https://your-domain.example/**` and `http://localhost:3000/**`).

Public registration is intentionally absent from the application. In **Authentication → Providers → Email**, disable **Allow new users to sign up** after the invited admin is established (wording may appear as “Enable sign ups”). Keep email/password enabled. Admins can still invite users from the Supabase dashboard.

## 3. Obtain the Auth UUID

In **Authentication → Users**, open Diresh's row and copy the **User UID**. Alternatively, run this read-only query:

```sql
select id, email, created_at
from auth.users
where lower(email) = lower('diresh.desilva@bowenstorage.com.au');
```

Confirm it returns exactly one row.

## 4. Assign the admin profile

After the Auth user exists, run this idempotent SQL. It resolves and uses the actual `auth.users.id`, and refuses to silently insert anything when no matching Auth user exists:

```sql
insert into public.user_profiles (id, full_name, email, role, active)
select
  id,
  'Diresh De Silva',
  'diresh.desilva@bowenstorage.com.au',
  'admin',
  true
from auth.users
where lower(email) = lower('diresh.desilva@bowenstorage.com.au')
on conflict (id) do update
set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  active = excluded.active,
  updated_at = now();
```

Verify it:

```sql
select p.id, p.full_name, p.email, p.role, p.active
from public.user_profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('diresh.desilva@bowenstorage.com.au');
```

## 5. Verification before Migration 2

Test in a private browser window: protected URLs redirect to `/login`; Diresh can sign in and reach `/dashboard`; refresh retains the session; all existing create/edit/archive operations still work; Settings opens; Sign Out returns to login. Also set `active = false` temporarily, confirm access is blocked, then restore it to `true` before continuing.

## 6. Proposed Migration 2 — do not apply yet

First inventory live policies with the query below and save the result. Migration 2 should be a separate reviewed migration that atomically replaces permissive `anon, authenticated` operational policies with:

- SELECT for `authenticated` when `public.is_active_user()` is true (admin and future read-only users).
- INSERT/UPDATE/DELETE for `authenticated` only when `public.current_user_role() = 'admin'`.
- No operational privileges or policies for `anon`.
- Admin-only profile management (while retaining own-profile SELECT).
- The same model on every operational table actually present in the live database, after verifying its schema: `suppliers`, `procurement_jobs`, `production_stages`, `supplier_production_settings`, `supplier_capacity_overrides`, `freight_forwarders`, `locations`, `freight_references`, `freight_bookings`, `freight_rates`, and any container/document tables found in production.

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

The implementation pattern for each verified operational table will be:

```sql
-- TEMPLATE ONLY. Do not run until admin login is confirmed and every live policy is inventoried.
drop policy if exists "<existing policy name>" on public.<verified_table>;
create policy "<table>_active_select" on public.<verified_table>
  for select to authenticated using (public.is_active_user());
create policy "<table>_admin_insert" on public.<verified_table>
  for insert to authenticated with check (public.current_user_role() = 'admin');
create policy "<table>_admin_update" on public.<verified_table>
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
create policy "<table>_admin_delete" on public.<verified_table>
  for delete to authenticated using (public.current_user_role() = 'admin');
```

## 7. Vercel environment

No new secret or service-role key is required. Confirm the existing Production, Preview, and Development environments contain:

- `NEXT_PUBLIC_SUPABASE_URL` — the existing project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the existing project's anon/publishable key.

Never add the Supabase service-role key to a `NEXT_PUBLIC_` variable. Redeploy after changing environment values. The app stores Supabase access and refresh tokens in secure, HTTP-only cookies; it does not implement a localStorage authentication system.
