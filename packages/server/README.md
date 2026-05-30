# @flowplan/server

FlowPlan's API: **Express + Prisma + PostgreSQL**, multi-tenant (teams with
OWNER/EDITOR/VIEWER roles), with a **server-side AI proxy** so provider keys never
reach the browser. It reuses the pure engine/model/AI logic from `@flowplan/core`,
so every AI response is re-scored by the same engine the client uses.

## Layout

```
prisma/schema.prisma     # User, Team, Membership, Workspace, Cell, Scenario,
                         # TeamAiCredential, AiUsageLog. Models stored as JSONB.
src/lib/                 # prisma accessor (injectable), env, crypto (AES-256-GCM),
                         # jwt (cookie session), http helpers, model migrate-on-read
src/middleware/          # requireAuth, requireTeamRole (resolves team from the
                         # route param chain), role ranking
src/routes/              # auth, teams, workspaces, cells, scenarios, ai, aiCredentials
src/ai/resolveTeamProvider.ts  # team key (decrypted) → provider, env fallback, offline
src/app.ts               # buildable Express app (no listen) — used by tests
src/index.ts             # bootstrap (listen)
```

## Configuration

Copy `.env.example` → `.env` and fill in `DATABASE_URL`, `JWT_SECRET`,
`MASTER_ENC_KEY` (base64 32 bytes). Optional `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
are env-level fallbacks used when a team has no stored credential.

## Run locally

```bash
docker compose up -d                 # Postgres on :5432
npm run prisma:deploy -w @flowplan/server   # apply migrations
npm run dev -w @flowplan/server      # API on :4000 (tsx watch)
```

## Data model decision

Each Cell/Scenario stores its full `Model` as a **JSONB** column (models are
small; the whole object is the read/write unit; `@flowplan/core/migrate` owns
intra-JSON schema evolution, so a `SCHEMA_VERSION` bump needs no SQL migration). A
denormalized `schemaVersion` column drives lazy migrate-on-read.

## Auth & authz

httpOnly cookie carrying a stateless JWT (HS256). `requireAuth` verifies the
token from the `flowplan_session` cookie **or** an `Authorization: Bearer <jwt>`
header (the SPA uses the cookie; API clients use the token returned by
`/auth/login` and `/auth/register`). `requireTeamRole(min)` resolves the team
from `:teamId` / `:wsId` / `:cellId`, loads the caller's membership, and gates by
role (OWNER > EDITOR > VIEWER), returning 404 (not 403) to non-members so
resource existence isn't leaked.

## API docs (OpenAPI / Swagger)

Interactive docs are always served at **`/api/docs`** (Swagger UI) and the raw
spec at **`/api/openapi.json`** (OpenAPI 3.0). The spec is generated from the
same `zod` request schemas the routes validate against (`src/openapi/schemas.ts`),
so it can't drift from what the server enforces — a test
(`src/openapi/openapi.test.ts`) fails if a route is added without documenting it.

To try authenticated endpoints: `POST /api/auth/login`, copy the returned
`token`, click **Authorize → bearerAuth**, and paste it. (On the same origin the
session cookie is also sent automatically.) The spec imports cleanly into Postman
or Insomnia.

## AI proxy

`POST /api/teams/:teamId/ai/{propose,narrate,edit,ingest,design,ingest-image,optimize-goal}`.
The server rebuilds the full `ProposalContext` from just the posted `model` (so
scores can't be spoofed), runs the team's provider — Claude/OpenAI built from the
decrypted `TeamAiCredential`, wrapped in `withFallback(strategist)` — and logs an
`AiUsageLog` row. Keys are written via `PUT /api/teams/:teamId/ai/credentials`
(OWNER, write-only) and stored AES-256-GCM-encrypted.

## Testing

`npm test` (repo root) runs all workspaces with **no database**: server handlers
call an injectable `getPrisma()` that tests replace with a deep mock
(`vitest-mock-extended`), and AI tests stub `fetch`. The optional golden-path
integration test runs against a real Postgres only when opted in:

```bash
docker compose up -d
DATABASE_URL=postgresql://flowplan:flowplan@localhost:5432/flowplan \
  npm run test:integration -w @flowplan/server   # sets RUN_DB_TESTS=1
```
