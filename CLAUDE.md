# CLAUDE.md

Bowen Supply Chain Control Tower — a Next.js 15 (App Router, React 19, TypeScript) app for suppliers, procurement jobs, production stages and freight. Data lives in Supabase PostgreSQL, accessed via its REST API from `lib/supabase.ts`. See `README.md` for database setup and the persistence acceptance test.

## Layout

- `app/` — routes: `/` dashboard, `/procurement`, `/production`, `/freight`, `/suppliers`
- `components/` — shared UI (`app-shell.tsx` is the sidebar/frame)
- `lib/` — Supabase client (`supabase.ts`), DB types, production helpers
- `supabase/migrations/` — SQL migrations, run manually in the Supabase SQL Editor
- `supabase/imports/` — one-off data imports

## Commands

```bash
npm install
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

## Light / dark mode

- Dark is the default; the ☀ / ☾ switch in the top bar sets `data-theme="light"` on `<html>` and remembers it in `localStorage`.
- `app/theme-light.css` is **generated** from `app/globals.css` — after changing colours in `globals.css`, run `npm.cmd run theme:light`. Never edit it by hand.
- Hand-tuned light-mode fixes go in `app/theme-light-overrides.css`.
- The Bowen logo (`public/bowen-logo.svg`) must never be recoloured or edited; in light mode it sits on a soft grey panel so the cream segment stays visible.

## Workflow rules

Every change follows these steps, in order:

1. **Branch** — create `feature/<short-name>` from `main`. Never work directly on `main`.
2. **Build and check locally** — `npm.cmd run typecheck`, then run the app (`.claude/launch.json` → `dev`) and verify the change against real data.
3. **User review** — the user clicks through it locally and approves.
4. **Preview deploy** — `vercel deploy` (preview) for a final check on Vercel.
5. **Merge** — push the branch, open a PR, merge into `main` once approved.
6. **Production** — `vercel deploy --prod` only after the user explicitly says yes.

Notes:
- Local dev currently points at the **live** Supabase database. Changes that only read data are safe to test; anything that writes, edits or deletes records must not be tested against live data until a separate test database is set up.
- Database schema changes: show the user the migration SQL before it is run.
- **Commit to local Git after every change.** One focused commit per change, with a clear message. Do not push to GitHub unless asked.
- **Migrations are additive only.** Never drop, truncate, reset or reseed existing tables. New schema changes go in a new timestamped file in `supabase/migrations/`.
- Never commit `.env*` (except `.env.example`) or `.vercel/` — both are gitignored.

## Deployment (Vercel)

- Project: `bowen-supply-chain-control-tower` in team `diresh` (this folder is linked via `.vercel/`).
- The GitHub repo is **disconnected** from Vercel: pushes do not deploy. Deploy from this folder with the CLI.
- Preview: `vercel deploy`. **Never run `vercel deploy --prod` without the user's explicit approval.**
- Previews are behind Vercel Authentication; use `vercel curl <url>` to check them.

### Windows quirks on this machine

- PowerShell script execution is disabled, so call the `.cmd` shims: `npm.cmd`, `vercel.cmd`.
- A corporate proxy intercepts TLS. Set `NODE_OPTIONS=--use-system-ca` before running the Vercel CLI, or it fails with "unable to verify the first certificate".

## Environment variables

- The app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- In Vercel they are set for Preview and Production only, and marked Sensitive, so `vercel env pull` writes `[SENSITIVE]` placeholders. For local dev, put the real values in `.env.local` by hand (from Supabase → Project Settings → API).
- `NEXT_PUBLIC_SUPABASE_URL` must be the bare project URL (`https://<ref>.supabase.co`), **not** the `.../rest/v1/` endpoint — `lib/supabase.ts` appends `/rest/v1/` itself, and a doubled path fails with "Invalid path specified in request URL".
