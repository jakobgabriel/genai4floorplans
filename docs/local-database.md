# Running FlowPlan against a local Postgres

`npm run dev` now runs the **full stack** — the web app *and* the API server —
so the app reads and writes your real Postgres database instead of falling back
to browser `localStorage`.

## One-time setup

1. Have Postgres running locally (any recent version; 16 is tested).
2. Create the database and a user, e.g.:
   ```sql
   CREATE USER flowplan WITH PASSWORD 'flowplan';
   CREATE DATABASE flowplan OWNER flowplan;
   ```
3. Point the server at it. Copy the example env and set `DATABASE_URL`:
   ```bash
   cp packages/server/.env.example packages/server/.env
   # edit packages/server/.env → DATABASE_URL="postgresql://flowplan:flowplan@localhost:5432/flowplan?schema=public"
   ```
   The server loads this `.env` automatically (via `dotenv`).

## Run it

```bash
npm run dev
```

This does three things:

1. **`db:setup`** — generates the Prisma client, applies migrations
   (`prisma migrate deploy`), and runs the **idempotent seed** (a dev user, team,
   workspace with a sample layout, and the global process catalog). Safe to re-run.
2. Starts the **API** on `:4000`.
3. Starts the **web** dev server on `:5173`, which proxies `/api` → `:4000`.

Open http://localhost:5173. In dev the app **auto-logs-in** the seeded user
(`dev@flowplan.local` / `devdevdev`) and opens the Postgres-backed workspace with
zero friction. The API prints a request log so you can watch each edit hit the DB.

- Web only (no DB): `npm run dev:web`
- API only: `npm run dev:api`
- Re-seed / re-migrate on demand: `npm run db:setup`

## What is persisted where

**In Postgres** (per team / workspace, via the API):

| Data | Table | Client store |
|------|-------|--------------|
| Workspace tree (folders › concepts › layouts) | `Workspace` / `Folder` / `Concept` / `Cell` | `useFlowPlan` → `ApiStorageProvider` |
| Each layout's full domain model (stations, flows, zones…) | `Cell.model` (JSONB) | same |
| Process library (global catalog + team custom entries) | `LibraryEntry` | `store/library.ts` |
| Grouped subflows | `Subflow` | `store/subflows.ts` |
| Users / teams / memberships / auth | `User` / `Team` / `Membership` | `store/bootstrap.ts` |
| AI credentials & usage (feature currently hidden) | `TeamAiCredential` / `AiUsageLog` | — |

**Device-local (browser `localStorage`, intentionally not in the DB):** UI
preferences only — theme, panel widths/collapse state, app settings.

**Known remaining gap:** the legacy Compare-page *scenarios* store
(`store/scenarios.ts`) still uses `localStorage` even though a `Scenario` table
and `/api/scenarios` routes exist. The workspace concepts/layouts model has
largely superseded it; wiring scenarios through the API is the next step if the
Compare page stays.

## How the offline fallback works

If the API can't be reached at startup, the app logs
`DB bootstrap failed; running offline (localStorage)` and keeps working against
`localStorage` so the front end is never blocked. If you expect the DB but see
that message, check that the API started and `DATABASE_URL` is correct.
