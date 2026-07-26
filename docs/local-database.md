# Running FlowPlan against a local Postgres

`npm run dev` runs the **full stack** — the web app *and* the API server — so the
app reads and writes your real Postgres database instead of falling back to
browser `localStorage`.

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
4. Generate the Prisma client, apply migrations, and seed:
   ```bash
   npm run setup
   ```
   `setup` runs `prisma generate` (client + engines — the **only** step that needs
   the network, and only the first time; the engines are then cached), `prisma
   migrate deploy`, and the **idempotent seed** (a dev user, team, workspace with a
   sample layout, and the global process catalog). Safe to re-run any time you pull
   new migrations.

## Run it

```bash
npm run dev
```

This starts the **API** on `:4000` and the **web** dev server on `:5173` (which
proxies `/api` → `:4000`). It does **not** touch the network — run `npm run setup`
once first (above). Prefer one command on a fresh clone? `npm run dev:fresh` does
`setup` then `dev`.

Open http://localhost:5173. In dev the app **auto-logs-in** the seeded user
(`dev@flowplan.local` / `devdevdev`) and opens the Postgres-backed workspace with
zero friction. The API prints a request log so you can watch each edit hit the DB.

- Web only (no DB): `npm run dev:web`
- API only: `npm run dev:api`
- Re-seed / re-migrate on demand: `npm run setup`

## Behind a corporate proxy / firewall (Windows)

If `npm run setup` fails on the `prisma generate` step with:

```
Error: request to https://binaries.prisma.sh/.../query_engine.dll.node.gz.sha256
failed, reason: unable to get local issuer certificate
```

your network is intercepting HTTPS and re-signing it with a **private root CA**
that Node.js doesn't trust — it is **not** a bug in FlowPlan. Prisma has to fetch
its engine binaries once, and that download hits the wall. Fix it by pointing Node
at your organisation's root certificate:

1. Get the corporate root CA as a `.pem`/`.crt` file. Ask IT, or export it from
   the Windows cert store: **certmgr.msc → Trusted Root Certification Authorities →
   Certificates →** right-click the proxy/corporate CA **→ All Tasks → Export → Base-64
   encoded X.509 (.CER)**.
2. Tell Node to trust it (persists across shells; reopen the terminal afterwards):
   ```powershell
   setx NODE_EXTRA_CA_CERTS "C:\path\to\corp-root-ca.pem"
   ```
   Or for the current shell only:
   ```powershell
   $env:NODE_EXTRA_CA_CERTS = "C:\path\to\corp-root-ca.pem"   # PowerShell
   set NODE_EXTRA_CA_CERTS=C:\path\to\corp-root-ca.pem         # cmd.exe
   ```
3. Re-run `npm run setup`. Once `prisma generate` succeeds the engines are cached,
   so you never need this again for day-to-day `npm run dev`.

**Last resort (insecure — dev machine only, never in CI or shared config):** skip
TLS verification for that one command:

```powershell
set NODE_TLS_REJECT_UNAUTHORIZED=0 && npm run setup
```

Unset it (`set NODE_TLS_REJECT_UNAUTHORIZED=`) right after — leaving it on disables
certificate checking for every Node process.

> The `package.json#prisma` deprecation warning you may also see is harmless — it
> just flags that a future Prisma 7 will prefer a `prisma.config.ts` file. Nothing
> to do for now.

## What is persisted where

**In Postgres** (per team / workspace, via the API):

| Data | Table | Client store |
|------|-------|--------------|
| Workspace tree (folders › concepts › layouts) | `Workspace` / `Folder` / `Concept` / `Cell` | `useFlowPlan` → `ApiStorageProvider` |
| Each layout's full domain model (stations, flows, zones…) | `Cell.model` (JSONB) | same |
| Process library (global catalog + team custom entries) | `LibraryEntry` | `store/library.ts` |
| Grouped subflows | `Subflow` | `store/subflows.ts` |
| Compare-page scenarios | `Scenario` | `store/scenarios.ts` |
| Per-user UI preferences (theme, panel widths/collapse) | `UserPreference` | `store/preferences.ts` |
| Users / teams / memberships / auth | `User` / `Team` / `Membership` | `store/bootstrap.ts` |
| AI credentials & usage (feature currently hidden) | `TeamAiCredential` / `AiUsageLog` | — |

**Device-local (browser `localStorage`):** used only as an **offline / first-paint
cache**. Scenarios and preferences now persist in Postgres when signed in;
`localStorage` mirrors them so the UI has something to render on the very first
frame and keeps working if the API is unreachable.

## How the offline fallback works

If the API can't be reached at startup, the app logs
`DB bootstrap failed; running offline (localStorage)` and keeps working against
`localStorage` so the front end is never blocked. If you expect the DB but see
that message, check that the API started and `DATABASE_URL` is correct.
