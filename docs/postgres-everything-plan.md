# Plan: everything in Postgres

Audit + migration plan to make Postgres the single source of truth for all
application state, with `localStorage` demoted to a pure offline cache. Written
as a database/interface-engineering review.

## 1. Principles / target end-state

1. **Postgres is authoritative** for every piece of domain and account data.
2. **`localStorage` is a cache, never a store of record** — it holds only (a) an
   offline mirror the app can boot from when the API is unreachable, and (b) a
   replay queue of edits made while offline.
3. **Every mutation goes through a typed REST endpoint** validated by the same
   zod schemas that generate the OpenAPI spec (no drift).
4. **Secrets never touch the browser store** — API keys live encrypted in the DB
   and are used only server-side.
5. **Concurrency-safe writes** — no silent last-write-wins across tabs/sessions.

## 2. Current-state audit

Legend: 🟢 in Postgres · 🟡 partial / fallback only · 🔴 local-only.

| Data | Where it lives today | Server model | Server route | Status |
|------|----------------------|--------------|--------------|--------|
| Users / auth (cookie session) | Postgres + httpOnly cookie | `User` | `/api/auth` | 🟢 |
| Teams / memberships | Postgres | `Team`, `Membership` | `/api/teams` | 🟢 |
| Workspace tree (folders › concepts › layouts) | Postgres | `Workspace`,`Folder`,`Concept`,`Cell` | `/api/workspaces/:id/tree` + granular | 🟢 (fixed) |
| Layout domain model (stations/flows/zones) | Postgres `Cell.model` JSONB | `Cell` | `/api/cells/:id` | 🟢 |
| Process library (global + team custom) | Postgres | `LibraryEntry` | `/api/…/library` | 🟢 |
| Grouped subflows | Postgres | `Subflow` | `/api/…/subflows` | 🟢 |
| **Compare scenarios (named variants)** | **`localStorage` `flowplan_scenarios`** | `Scenario` ✅ | `/api/…/scenarios` ✅ | 🔴 **route+provider exist, client not wired** |
| **Working-model autosave** | **`localStorage` `flowplan_model`** | (covered by `Cell.model`) | — | 🔴 **redundant legacy** |
| **AI provider choice + models** | **`localStorage` `flowplan_settings`** | — (needs prefs table) | — | 🔴 |
| **AI API keys** | **`localStorage` `flowplan_settings`** | `TeamAiCredential` (encrypted) ✅ | `/api/…/ai-credentials` ✅ | 🔴 **secret in browser; DB path exists, client not wired** |
| Theme (`flowplan_theme`) | `localStorage` | — | — | 🔴 device pref |
| Panel widths/collapse (`flowplan_config_*`,`flowplan_lib_*`) | `localStorage` | — | — | 🔴 device pref |
| Workspace/library/subflow offline mirrors (`flowplan_workspace/library/subflows`) | `localStorage` | (primary is Postgres) | — | 🟡 fallback only (keep) |
| Undo/redo history, optimize/improve preview | in-memory | — | — | ✅ ephemeral (correctly not persisted) |

**Headline:** the domain core is already 🟢 after the `ApiStorageProvider` fetch
fix. The genuine gaps are **scenarios**, **AI settings/keys**, and **user
preferences** (theme/panel state). One legacy redundancy (`flowplan_model`).

## 3. Schema changes

Only two new tables; everything else already exists.

1. **`UserPreference`** — per-user UI + app preferences (theme, panel
   widths/collapse, AI provider/model choice). One row per user, a `prefs` JSONB
   blob (versioned like `Cell.model`) so adding a preference needs no migration.
   ```prisma
   model UserPreference {
     userId    String   @id
     user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
     prefs     Json     // { theme, panels:{configW,libW,...}, ai:{provider,models} }
     updatedAt DateTime @updatedAt
   }
   ```
2. **Optimistic-concurrency columns** — add a monotonic `version Int @default(0)`
   (or rely on the existing `updatedAt`) to `Cell`, `Concept`, `Folder`,
   `Workspace` so writes can be rejected on stale base-version (see §6).

`Scenario` and `TeamAiCredential` already exist — no schema work for those.

## 4. New / newly-wired endpoints

| Endpoint | Purpose | State |
|----------|---------|-------|
| `GET/PUT /api/me/preferences` | load/save the `UserPreference` blob | **new** |
| `GET/PUT/DELETE/PATCH /api/workspaces/:id/scenarios[...]` | scenarios CRUD | **exists — wire client** |
| `GET/PUT/DELETE /api/teams/:id/ai-credentials` | encrypted AI keys | **exists — wire client** |
| `PUT /api/workspaces/:id/tree` (+ granular cell/concept) | add `baseVersion` check → 409 on conflict | **augment** |

## 5. Client work (the bulk of it)

1. **Scenarios → API.** `store/scenarios.ts` is sync + `localStorage`. Replace its
   internals with the `ApiStorageProvider` scenario methods (already implemented:
   `listScenarios/saveScenario/loadScenario/deleteScenario/moveScenario`), keeping
   a `localStorage` mirror as the offline fallback. Callers (`ComparePage`,
   `panels.tsx`, `AiChatPanel`) move from sync reads to the hydrated
   session cache + async saves (same pattern already used by `library`/`subflows`).
   Hydrate scenarios in `store/bootstrap.ts` alongside library/subflows.
2. **Retire `flowplan_model` autosave.** The active `Cell.model` is already saved
   to Postgres on every edit; delete the parallel `loadAutosave/saveAutosave`
   path (keep only as part of the offline mirror).
3. **User preferences → API.** New `store/preferences.ts` hydrated on bootstrap;
   `theme.ts`, the panel-width/collapse state in `App.tsx`, and the AI
   provider/model choice read/write it (debounced PUT). Keep a `localStorage`
   copy purely for instant first paint before hydration resolves.
4. **AI keys → encrypted DB.** `SettingsModal` writes keys via the
   `ai-credentials` endpoint instead of `flowplan_settings`; the browser never
   persists a key. (AI is currently hidden, so this ships behind that flag.)
5. **Offline write queue.** When `getProvider()` calls fail, enqueue the mutation
   in `localStorage` and replay on next successful bootstrap, so an offline edit
   is not lost. Surface an explicit "offline — changes will sync" indicator.

## 6. Cross-cutting engineering concerns

- **Concurrency / lost updates.** The workspace save is a single bulk
  `PUT …/tree` with last-write-wins. Two tabs (or the debounce racing a
  navigation) can clobber each other. Add optimistic concurrency: send the
  `baseVersion`/`updatedAt` the client loaded; the server rejects with `409` if
  the row moved, and the client reloads + reapplies. Longer term, prefer the
  **granular** endpoints (`saveCell`, concept/folder PATCH — already in the
  provider) over the whole-tree PUT so edits are smaller and less collision-prone.
- **Payload size.** `Cell.model` + base64 layout images ride inside the tree PUT
  (`express.json` limit is 4 MB). Granular `PUT /cells/:id` avoids re-sending
  every layout on each keystroke; move the debounced autosave to per-cell saves.
- **Migrations.** Domain JSON evolves via `@flowplan/core/migrate` + the
  `schemaVersion` column (migrate-on-read) — unchanged. The two new tables need a
  Prisma migration; keep them additive.
- **Prod auth.** `bootstrap.ts` auto-logs-in the seed user **only in dev**. A real
  login/register UI is required before this is anything but a local tool; the
  `/api/auth` endpoints already exist.
- **Tests.** Each new/rewired endpoint gets a mocked-Prisma route test + an entry
  in the OpenAPI registry (the drift test enforces coverage); extend
  `storage.contract.test.ts` for scenarios/preferences so every provider honours
  the same contract; add a DB-integration test under `RUN_DB_TESTS`.

## 7. Phasing

- **Phase 1 — close the real gaps (highest value).**
  Wire scenarios through the API; retire the `flowplan_model` autosave. Ships the
  last piece of *domain* data into Postgres. ~1 focused PR.
- **Phase 2 — durability & correctness.**
  Optimistic concurrency (`baseVersion` → 409 + reload) and the move from
  whole-tree PUT to granular per-cell saves. Offline write queue + status
  indicator. ~1 PR.
- **Phase 3 — preferences & secrets.**
  `UserPreference` table + `/api/me/preferences`; migrate theme/panel/AI-choice
  off `localStorage`. Route AI keys through the encrypted `TeamAiCredential`
  endpoint. ~1 PR (mostly behind the hidden-AI flag).
- **Phase 4 — production readiness (optional, when it leaves local).**
  Real auth UI, session refresh, per-environment config, backup/restore docs.

## 8. Definition of done

Every key currently written to `localStorage` is either (a) removed, or (b)
demoted to an offline mirror/queue with Postgres as the source of record; a fresh
browser profile pointed at the app reproduces the full workspace, library,
subflows, scenarios and preferences purely from the database; and concurrent
edits from two tabs never silently lose data.
