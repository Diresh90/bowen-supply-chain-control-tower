# Bowen Supply Chain Control Tower

Approved suppliers, procurement jobs, and their child production stages are stored permanently in Supabase PostgreSQL. No browser or filesystem persistence is used.

## Database setup

1. Open **Supabase → SQL Editor → New Query**.
2. Copy the complete contents of [`supabase/migrations/20260928000000_phase_1_suppliers_procurement.sql`](supabase/migrations/20260928000000_phase_1_suppliers_procurement.sql), paste it into the editor, and run it.
3. Confirm that `suppliers` and `procurement_jobs` appear in Table Editor.

### Production additive migration

After Phase 1 is installed, open a new SQL Editor query and run the complete contents of [`supabase/migrations/20260928010000_add_production_stages.sql`](supabase/migrations/20260928010000_add_production_stages.sql). This is an additive migration: it creates only `production_stages`, its indexes, validation trigger, permissions, and policies. It never resets, drops, truncates, reseeds, or recreates existing supplier or procurement tables.

Each production stage has foreign keys to its parent `procurement_jobs` row and that job's approved `suppliers` row. The validation trigger locks the parent during allocation, requires the supplier to match, and prevents the summed stage quantities from exceeding `procurement_jobs.total_containers` unless the user explicitly confirms an allocation override.

The migration is the complete, re-runnable SQL script. It creates both tables, their foreign key and constraints, automatic `updated_at` triggers, indexes, grants, and Phase 1 RLS policies. The supplier foreign key uses `ON DELETE RESTRICT`, so a supplier attached to a procurement job cannot be accidentally deleted; set it inactive to archive it instead.

> Phase 1 does not include authentication. The migration permits both `anon` and `authenticated` roles to access these two tables so the deployed application can perform CRUD operations. Before exposing the control tower publicly, add authentication and replace the Phase 1 policies with user- or organisation-scoped policies.

## Environment

The Supabase Vercel integration normally supplies the URL and key. Verify these names in **Vercel → Project Settings → Environment Variables**:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

For local development, copy `.env.example` to `.env.local` and use the same values.

## Run and verify

```bash
npm install
npm run dev
```

Open `/suppliers` and `/procurement`. Each successful create, edit, or delete waits for Supabase to respond and then reloads the corresponding table. An error response is shown without updating the UI as though the write succeeded.

Persistence acceptance test:

1. Add a supplier, refresh, and confirm it remains.
2. Add a procurement job using that supplier, refresh, and confirm it remains.
3. Edit both records, refresh, and confirm both changes remain.
4. Redeploy Vercel and confirm both records still remain.
