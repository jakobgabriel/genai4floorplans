# FlowPlan

Cell & material-flow assessment tool for manufacturing. Rate a production cell's
actual state across flow, balance, ergonomics and automation, then see a scored
**improved layout** — no CAD, no backend required.

This is the productized app, ported from the original single-file demo
(`legacy/flowplan-demo.html`) into a modular, typed, tested React + TypeScript
SPA, now an **npm-workspaces monorepo** with an optional API backend. The full
product spec lives in [`docs/flowplanspec.md`](docs/flowplanspec.md).

## Quick start

```bash
npm install
npm run dev        # web dev server (the SPA)
npm run build      # production build of the SPA to packages/web/dist/
npm run preview    # serve the production build
npm run test       # run all workspace test suites (no database needed)
npm run typecheck  # type-check core + web + server
```

The SPA build output is fully static and can be served by any web host. The app
runs entirely offline (localStorage) with no backend; the API server adds
accounts, teams, and a server-side AI proxy when you want them.

## Deploy the full stack — one command

```bash
docker compose up --build
```

This builds and starts **everything**: PostgreSQL + the app (API **and** the SPA
served from the same origin) on http://localhost:4000. Migrations are applied
automatically on startup, and it runs with safe **dev defaults** so no setup is
required. Data persists in a named volume across `down`/`up`.

For any real deployment, copy `.env.example` → `.env` and set real secrets
(`JWT_SECRET`, a fresh base64 32-byte `MASTER_ENC_KEY`, DB password, optional AI
keys). Compose auto-loads `.env`. **Note:** changing `MASTER_ENC_KEY` invalidates
any AI credentials already stored encrypted in the database.

The web app talks to the API at a relative `/api`, so serving both from one Node
process (the deploy default, via `WEB_DIST`) means no CORS or proxy config.

### Local development without Docker

```bash
# start a Postgres (the dev-only compose in packages/server), then:
docker compose -f packages/server/docker-compose.yml up -d
DATABASE_URL=postgresql://flowplan:flowplan@localhost:5432/flowplan \
  npm run prisma:deploy -w @flowplan/server   # once, to apply migrations
DATABASE_URL=postgresql://flowplan:flowplan@localhost:5432/flowplan \
  npm run dev:all                              # web (5173) + API (4000) together
```

`npm run dev:all` runs the web and API dev servers concurrently. See
[`packages/server/README.md`](packages/server/README.md) for API details.

## Architecture — monorepo

```
packages/
  core/    @flowplan/core — pure, isomorphic logic shared by web + server:
           model/ (types, defaults, sample, migration), engine/ (KPIs, optimizer,
           balance, validation, automation, templates, rating), ai/ (strategist,
           verify, prompts, llm transports, fallback), store/reducer, io/json.
  web/     the React SPA: components, store (useFlowPlan, workspace, scenarios,
           settings, the StorageProvider abstraction), io download/csv/image/report,
           ai/provider (client selector + remote provider).
  server/  @flowplan/server — Express + Prisma + Postgres API (see its README):
           multi-tenant teams, workspace/cell/scenario CRUD, server-side AI proxy.
```

The **engine is framework-free and deterministic** (spec §4) and lives in
`@flowplan/core` so the server re-scores AI output with the exact same code the
client uses. Golden-fixture tests in `packages/core/src/engine/engine.test.ts`
lock the demo's numbers so refactors can't silently change a rating.

`@flowplan/core` is consumed as a workspace package (`@flowplan/core/<path>`),
resolved to source via its `exports` map — no build step required to run or test.

## Storage: offline-first, optional cloud

The web app reads/writes through a `StorageProvider` abstraction
(`packages/web/src/store/storage/`). Signed-out, it uses `LocalStorageProvider`
(today's localStorage behavior); signed into a team, `ApiStorageProvider` syncs to
the server. Both satisfy one contract test, so the app behaves identically either
way. AI keys, when using the server, live encrypted server-side and never reach
the browser. See [`packages/server/README.md`](packages/server/README.md).

## What's in this version

Beyond demo parity, this version adds:

- **UX & onboarding** — first-run start screen, undo/redo (`Ctrl/Cmd+Z`),
  on-canvas flow drawing (tap source → target), arrow-key nudging, view
  hotkeys (`1/2/3`), scroll-zoom + pan, KPI help popovers (which surface the
  model's honest limitations), and toasts.
- **Data-model flexibility** — editable grid size, station id rename (rewrites
  flows), in-canvas no-go zones, and a per-station / per-cell shift model.
- **Robustness** — schema versioning + migration so old JSON keeps loading,
  non-destructive import with friendly errors, named scenarios for comparing
  variants, and CSV export of the KPI + automation tables.
- **Optimizer credibility** — footprint-collision and no-go avoidance, plus
  bottleneck-aware "split / parallelize" suggestions in the Balance panel.

## Honest limitations

The optimizer is greedy pairwise swapping (a local floor, not a global optimum);
line balance treats the cell as a single sequential chain; congestion is a
centerline proxy; automation potential is a heuristic, not a validated ROI model.
These are surfaced in-app via the `?` help popovers. See spec §9.
