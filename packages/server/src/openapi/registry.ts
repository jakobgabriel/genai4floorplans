import { OpenAPIRegistry, type RouteConfig } from "@asteasolutions/zod-to-openapi";
import {
  z,
  AiCredentialBody,
  AiCredentialMeta,
  AiDesignBody,
  AiEditBody,
  AiIngestBody,
  AiIngestImageBody,
  AiModelBody,
  AiOptimizeGoalBody,
  Cell,
  CellMeta,
  CreateCellBody,
  CreateConceptBody,
  CreateFolderBody,
  CreateTeamBody,
  CreateWorkspaceBody,
  Concept,
  ErrorResponse,
  Folder,
  LoginBody,
  MemberBody,
  Membership,
  ModelSchema,
  MoveScenarioBody,
  PatchCellMetaBody,
  PutCellModelBody,
  RatingSchema,
  RegisterBody,
  ScenarioMeta,
  ScenarioModelBody,
  UpdateConceptBody,
  UpdateFolderBody,
  TeamMembership,
  TeamSummary,
  TeamWithMembers,
  UpdateMemberBody,
  UpdateTeamBody,
  UpdateWorkspaceBody,
  User,
  Workspace,
  WorkspaceSummary,
} from "./schemas.ts";

export const registry = new OpenAPIRegistry();

// Security schemes: the SPA uses the httpOnly cookie; API clients (and Swagger's
// Authorize button) use the Bearer token returned by register/login.
registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "flowplan_session",
  description: "httpOnly session cookie set by /auth/login and /auth/register.",
});
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "The JWT returned (as `token`) by /auth/login and /auth/register.",
});

const AUTHED: RouteConfig["security"] = [{ cookieAuth: [] }, { bearerAuth: [] }];
const PUBLIC: RouteConfig["security"] = [];

const STATUS_DESC: Record<number, string> = {
  400: "Validation failed",
  401: "Not authenticated",
  403: "Insufficient role",
  404: "Not found / not a member",
  409: "Conflict",
};

const json = (schema: z.ZodTypeAny) => ({ content: { "application/json": { schema } } });
const errs = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [c, { description: STATUS_DESC[c], ...json(ErrorResponse) }]));

interface Def {
  method: RouteConfig["method"];
  path: string;
  tags: string[];
  summary: string;
  description?: string;
  params?: z.AnyZodObject;
  body?: z.ZodTypeAny;
  ok: { status: number; description: string; schema?: z.ZodTypeAny };
  errors?: number[];
  security?: RouteConfig["security"];
}

function reg(d: Def): void {
  const responses: RouteConfig["responses"] = {
    [d.ok.status]: { description: d.ok.description, ...(d.ok.schema ? json(d.ok.schema) : {}) },
    ...errs(...(d.errors ?? [])),
  };
  const request: RouteConfig["request"] = {};
  if (d.params) request.params = d.params;
  if (d.body) request.body = json(d.body);
  registry.registerPath({
    method: d.method,
    path: d.path,
    tags: d.tags,
    summary: d.summary,
    description: d.description,
    security: d.security ?? AUTHED,
    request: d.params || d.body ? request : undefined,
    responses,
  });
}

const teamId = z.object({ teamId: z.string() });
const wsId = z.object({ wsId: z.string() });
const cellId = z.object({ cellId: z.string() });
const folderId = z.object({ folderId: z.string() });
const conceptId = z.object({ conceptId: z.string() });

// ---- System ---------------------------------------------------------------
reg({
  method: "get", path: "/api/health", tags: ["System"], security: PUBLIC,
  summary: "Health check",
  ok: { status: 200, description: "OK", schema: z.object({ ok: z.boolean() }) },
});

// ---- Auth -----------------------------------------------------------------
reg({
  method: "post", path: "/api/auth/register", tags: ["Auth"], security: PUBLIC,
  summary: "Register a new user", description: "Sets the session cookie and returns a Bearer token.",
  body: RegisterBody,
  ok: { status: 201, description: "Created", schema: z.object({ user: User, token: z.string() }) },
  errors: [400, 409],
});
reg({
  method: "post", path: "/api/auth/login", tags: ["Auth"], security: PUBLIC,
  summary: "Log in", description: "Sets the session cookie and returns a Bearer token.",
  body: LoginBody,
  ok: { status: 200, description: "OK", schema: z.object({ user: User, token: z.string() }) },
  errors: [400, 401],
});
reg({
  method: "post", path: "/api/auth/logout", tags: ["Auth"], security: PUBLIC,
  summary: "Log out (clears the session cookie)",
  ok: { status: 204, description: "No Content" },
});
reg({
  method: "get", path: "/api/auth/me", tags: ["Auth"],
  summary: "Current user + team memberships",
  ok: { status: 200, description: "OK", schema: z.object({ user: User, memberships: z.array(Membership) }) },
  errors: [401],
});

// ---- Teams ----------------------------------------------------------------
reg({
  method: "get", path: "/api/teams", tags: ["Teams"],
  summary: "List teams the caller belongs to",
  ok: { status: 200, description: "OK", schema: z.object({ teams: z.array(TeamSummary) }) },
  errors: [401],
});
reg({
  method: "post", path: "/api/teams", tags: ["Teams"],
  summary: "Create a team (caller becomes OWNER)", body: CreateTeamBody,
  ok: { status: 201, description: "Created", schema: z.object({ team: TeamSummary }) },
  errors: [400, 401],
});
reg({
  method: "get", path: "/api/teams/{teamId}", tags: ["Teams"], params: teamId,
  summary: "Team detail + members", description: "Requires VIEWER role.",
  ok: { status: 200, description: "OK", schema: z.object({ team: TeamWithMembers }) },
  errors: [401, 404],
});
reg({
  method: "patch", path: "/api/teams/{teamId}", tags: ["Teams"], params: teamId, body: UpdateTeamBody,
  summary: "Rename a team", description: "Requires OWNER role.",
  ok: { status: 200, description: "OK", schema: z.object({ team: TeamSummary.pick({ id: true, name: true }) }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "delete", path: "/api/teams/{teamId}", tags: ["Teams"], params: teamId,
  summary: "Delete a team", description: "Requires OWNER role. Cascades to workspaces/cells/scenarios.",
  ok: { status: 204, description: "No Content" }, errors: [401, 403, 404],
});

// ---- Members --------------------------------------------------------------
reg({
  method: "post", path: "/api/teams/{teamId}/members", tags: ["Members"], params: teamId, body: MemberBody,
  summary: "Add or update a member by email", description: "Requires OWNER role.",
  ok: { status: 201, description: "Created", schema: z.object({ membership: TeamMembership }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "patch", path: "/api/teams/{teamId}/members/{userId}", tags: ["Members"],
  params: teamId.extend({ userId: z.string() }), body: UpdateMemberBody,
  summary: "Change a member's role", description: "Requires OWNER role.",
  ok: { status: 200, description: "OK", schema: z.object({ membership: TeamMembership }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "delete", path: "/api/teams/{teamId}/members/{userId}", tags: ["Members"],
  params: teamId.extend({ userId: z.string() }),
  summary: "Remove a member", description: "Requires OWNER role.",
  ok: { status: 204, description: "No Content" }, errors: [401, 403, 404],
});

// ---- Workspaces -----------------------------------------------------------
reg({
  method: "get", path: "/api/teams/{teamId}/workspaces", tags: ["Workspaces"], params: teamId,
  summary: "List a team's workspaces", description: "Requires VIEWER role.",
  ok: { status: 200, description: "OK", schema: z.object({ workspaces: z.array(WorkspaceSummary) }) },
  errors: [401, 404],
});
reg({
  method: "post", path: "/api/teams/{teamId}/workspaces", tags: ["Workspaces"], params: teamId, body: CreateWorkspaceBody,
  summary: "Create a workspace (seeds one blank cell)", description: "Requires EDITOR role.",
  ok: { status: 201, description: "Created", schema: z.object({ workspace: z.object({ id: z.string(), name: z.string(), activeId: z.string() }) }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "get", path: "/api/workspaces/{wsId}", tags: ["Workspaces"], params: wsId,
  summary: "Hydrate a workspace (all cells, migrated)", description: "Requires VIEWER role.",
  ok: { status: 200, description: "OK", schema: z.object({ workspace: Workspace }) },
  errors: [401, 404],
});
reg({
  method: "patch", path: "/api/workspaces/{wsId}", tags: ["Workspaces"], params: wsId, body: UpdateWorkspaceBody,
  summary: "Rename or set the active cell", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: z.object({ workspace: z.object({ id: z.string(), name: z.string(), activeId: z.string().nullable() }) }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "delete", path: "/api/workspaces/{wsId}", tags: ["Workspaces"], params: wsId,
  summary: "Delete a workspace", description: "Requires OWNER role.",
  ok: { status: 204, description: "No Content" }, errors: [401, 403, 404],
});

// ---- Cells ----------------------------------------------------------------
reg({
  method: "post", path: "/api/workspaces/{wsId}/cells", tags: ["Cells"], params: wsId, body: CreateCellBody,
  summary: "Add a cell (also used for duplicate)", description: "Requires EDITOR role.",
  ok: { status: 201, description: "Created", schema: z.object({ cell: Cell }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "get", path: "/api/cells/{cellId}", tags: ["Cells"], params: cellId,
  summary: "Get a cell (migrated on read)", description: "Requires VIEWER role.",
  ok: { status: 200, description: "OK", schema: z.object({ cell: Cell }) },
  errors: [401, 404],
});
reg({
  method: "put", path: "/api/cells/{cellId}", tags: ["Cells"], params: cellId, body: PutCellModelBody,
  summary: "Save a cell's model (autosave)", description: "Requires EDITOR role. Re-runs the engine and returns the rating.",
  ok: { status: 200, description: "OK", schema: z.object({ cell: Cell, rating: RatingSchema }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "patch", path: "/api/cells/{cellId}", tags: ["Cells"], params: cellId, body: PatchCellMetaBody,
  summary: "Rename or reorder a cell", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: z.object({ cell: CellMeta }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "delete", path: "/api/cells/{cellId}", tags: ["Cells"], params: cellId,
  summary: "Delete a cell", description: "Requires EDITOR role.",
  ok: { status: 204, description: "No Content" }, errors: [401, 403, 404],
});

// ---- Scenarios ------------------------------------------------------------
reg({
  method: "get", path: "/api/workspaces/{wsId}/scenarios", tags: ["Scenarios"], params: wsId,
  summary: "List saved scenarios (metadata)", description: "Requires VIEWER role.",
  ok: { status: 200, description: "OK", schema: z.object({ scenarios: z.array(ScenarioMeta) }) },
  errors: [401, 404],
});
reg({
  method: "put", path: "/api/workspaces/{wsId}/scenarios/{name}", tags: ["Scenarios"],
  params: wsId.extend({ name: z.string() }), body: ScenarioModelBody,
  summary: "Save (upsert) a named scenario", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: z.object({ scenario: ScenarioMeta }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "get", path: "/api/workspaces/{wsId}/scenarios/{name}", tags: ["Scenarios"],
  params: wsId.extend({ name: z.string() }),
  summary: "Load a scenario's model", description: "Requires VIEWER role.",
  ok: { status: 200, description: "OK", schema: z.object({ model: ModelSchema }) },
  errors: [401, 404],
});
reg({
  method: "patch", path: "/api/workspaces/{wsId}/scenarios/{name}", tags: ["Scenarios"],
  params: wsId.extend({ name: z.string() }), body: MoveScenarioBody,
  summary: "Move a scenario into a folder (or root)", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: z.object({ scenario: ScenarioMeta }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "delete", path: "/api/workspaces/{wsId}/scenarios/{name}", tags: ["Scenarios"],
  params: wsId.extend({ name: z.string() }),
  summary: "Delete a scenario", description: "Requires EDITOR role.",
  ok: { status: 204, description: "No Content" }, errors: [401, 403, 404],
});

// ---- Folders --------------------------------------------------------------
reg({
  method: "post", path: "/api/workspaces/{wsId}/folders", tags: ["Folders"], params: wsId, body: CreateFolderBody,
  summary: "Create a folder (optionally nested under parentId)", description: "Requires EDITOR role.",
  ok: { status: 201, description: "Created", schema: z.object({ folder: Folder }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "patch", path: "/api/folders/{folderId}", tags: ["Folders"], params: folderId, body: UpdateFolderBody,
  summary: "Rename, move, or reorder a folder",
  description: "Requires EDITOR role. Moving into one's own descendant is rejected (cycle guard).",
  ok: { status: 200, description: "OK", schema: z.object({ folder: Folder }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "delete", path: "/api/folders/{folderId}", tags: ["Folders"], params: folderId,
  summary: "Delete a folder", description: "Requires EDITOR role. Reparents child folders, concepts, layouts, and scenarios up one level (no data loss).",
  ok: { status: 204, description: "No Content" }, errors: [401, 403, 404],
});

// ---- Concepts -------------------------------------------------------------
reg({
  method: "post", path: "/api/workspaces/{wsId}/concepts", tags: ["Concepts"], params: wsId, body: CreateConceptBody,
  summary: "Create a concept (optionally inside a folder)", description: "Requires EDITOR role. A concept is the workspace item holding one or more layouts.",
  ok: { status: 201, description: "Created", schema: z.object({ concept: Concept }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "patch", path: "/api/concepts/{conceptId}", tags: ["Concepts"], params: conceptId, body: UpdateConceptBody,
  summary: "Rename, move, or reorder a concept",
  description: "Requires EDITOR role. Moving into a folder moves its layouts with it.",
  ok: { status: 200, description: "OK", schema: z.object({ concept: Concept }) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "delete", path: "/api/concepts/{conceptId}", tags: ["Concepts"], params: conceptId,
  summary: "Delete a concept", description: "Requires EDITOR role. Its layouts cascade with it.",
  ok: { status: 204, description: "No Content" }, errors: [401, 403, 404],
});

// ---- AI proxy -------------------------------------------------------------
const aiResult = (key: string, schema: z.ZodTypeAny) => z.object({ [key]: schema });
reg({
  method: "post", path: "/api/teams/{teamId}/ai/propose", tags: ["AI"], params: teamId, body: AiModelBody,
  summary: "Propose layout improvements", description: "Requires EDITOR role. Engine re-scores every candidate.",
  ok: { status: 200, description: "OK", schema: aiResult("proposals", z.array(z.any())) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "post", path: "/api/teams/{teamId}/ai/narrate", tags: ["AI"], params: teamId, body: AiModelBody,
  summary: "Narrate the rating & trade-offs", description: "Requires VIEWER role.",
  ok: { status: 200, description: "OK", schema: aiResult("narration", z.string()) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "post", path: "/api/teams/{teamId}/ai/edit", tags: ["AI"], params: teamId, body: AiEditBody,
  summary: "Natural-language edit of the model", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: aiResult("result", z.any()) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "post", path: "/api/teams/{teamId}/ai/ingest", tags: ["AI"], params: teamId, body: AiIngestBody,
  summary: "Ingest a routing sheet (text/CSV) into a model", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: aiResult("model", ModelSchema) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "post", path: "/api/teams/{teamId}/ai/design", tags: ["AI"], params: teamId, body: AiDesignBody,
  summary: "Generate a cell from a prose brief", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: aiResult("model", ModelSchema) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "post", path: "/api/teams/{teamId}/ai/ingest-image", tags: ["AI"], params: teamId, body: AiIngestImageBody,
  summary: "Ingest a layout image into a model (vision; needs a provider key)", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: aiResult("model", ModelSchema) },
  errors: [400, 401, 403, 404],
});
reg({
  method: "post", path: "/api/teams/{teamId}/ai/optimize-goal", tags: ["AI"], params: teamId, body: AiOptimizeGoalBody,
  summary: "Goal-driven optimization", description: "Requires EDITOR role.",
  ok: { status: 200, description: "OK", schema: aiResult("result", z.any()) },
  errors: [400, 401, 403, 404],
});

// ---- AI Credentials -------------------------------------------------------
reg({
  method: "put", path: "/api/teams/{teamId}/ai/credentials", tags: ["AI Credentials"], params: teamId, body: AiCredentialBody,
  summary: "Store a team AI provider key (write-only)", description: "Requires OWNER role. The key is encrypted at rest and never returned.",
  ok: { status: 204, description: "No Content" }, errors: [400, 401, 403, 404],
});
reg({
  method: "get", path: "/api/teams/{teamId}/ai/credentials", tags: ["AI Credentials"], params: teamId,
  summary: "List configured providers (no secrets)", description: "Requires OWNER role.",
  ok: { status: 200, description: "OK", schema: z.object({ credentials: z.array(AiCredentialMeta) }) },
  errors: [401, 403, 404],
});
