import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { AiProviderId, Role } from "@prisma/client";

// MUST run before any .openapi() call below. Everything that defines OpenAPI
// metadata imports z from this module (or imports this module first), so the
// extension is always applied.
extendZodWithOpenApi(z);

export { z };

// ---- shared value schemas ------------------------------------------------

export const RoleEnum = z.nativeEnum(Role).openapi("Role");
export const AiProviderIdEnum = z.nativeEnum(AiProviderId).openapi("AiProviderId");

// The domain Model and Rating come from @flowplan/core (not zod). Documented
// loosely: a Model is an object with stations[] and flows[] (plus the rest of
// the FlowPlan model); Rating is the engine's computed score object.
export const ModelSchema = z
  .object({ stations: z.array(z.any()), flows: z.array(z.any()) })
  .passthrough()
  .openapi("Model", {
    description: "A FlowPlan domain model (see @flowplan/core). Must include stations[] and flows[]; other fields are filled by migrate().",
  });

export const RatingSchema = z
  .record(z.any())
  .openapi("Rating", { description: "Engine-computed rating (buildRating from @flowplan/core): grade letter, composite, KPI scores, etc." });

// ---- request bodies (the single source of truth, imported by the routes) --

export const RegisterBody = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1).optional(),
  })
  .openapi("RegisterBody");

export const LoginBody = z
  .object({ email: z.string().email(), password: z.string().min(8) })
  .openapi("LoginBody");

export const CreateTeamBody = z.object({ name: z.string().min(1) }).openapi("CreateTeamBody");
export const UpdateTeamBody = z.object({ name: z.string().min(1) }).openapi("UpdateTeamBody");

export const MemberBody = z
  .object({ email: z.string().email(), role: RoleEnum })
  .openapi("MemberBody");
export const UpdateMemberBody = z.object({ role: RoleEnum }).openapi("UpdateMemberBody");

export const CreateWorkspaceBody = z.object({ name: z.string().min(1) }).openapi("CreateWorkspaceBody");
export const UpdateWorkspaceBody = z
  .object({ name: z.string().min(1).optional(), activeId: z.string().optional() })
  .openapi("UpdateWorkspaceBody");

export const CreateCellBody = z
  .object({ name: z.string().min(1), model: ModelSchema, folderId: z.string().nullable().optional(), conceptId: z.string().nullable().optional() })
  .openapi("CreateCellBody");
export const PutCellModelBody = z.object({ model: ModelSchema }).openapi("PutCellModelBody");
export const PatchCellMetaBody = z
  .object({
    name: z.string().min(1).optional(),
    position: z.number().int().optional(),
    folderId: z.string().nullable().optional(),
    conceptId: z.string().nullable().optional(),
  })
  .openapi("PatchCellMetaBody");

// Concepts are the workspace item; each holds one or more layouts (cells).
export const CreateConceptBody = z
  .object({ name: z.string().min(1), folderId: z.string().nullable().optional() })
  .openapi("CreateConceptBody");
export const UpdateConceptBody = z
  .object({
    name: z.string().min(1).optional(),
    folderId: z.string().nullable().optional(),
    position: z.number().int().optional(),
  })
  .openapi("UpdateConceptBody");

export const ScenarioModelBody = z.object({ model: ModelSchema }).openapi("ScenarioModelBody");
export const MoveScenarioBody = z.object({ folderId: z.string().nullable() }).openapi("MoveScenarioBody");

// Folders organize layouts/scenarios; parentId null = workspace root.
export const CreateFolderBody = z
  .object({ name: z.string().min(1), parentId: z.string().nullable().optional() })
  .openapi("CreateFolderBody");
export const UpdateFolderBody = z
  .object({
    name: z.string().min(1).optional(),
    parentId: z.string().nullable().optional(),
    position: z.number().int().optional(),
  })
  .openapi("UpdateFolderBody");

// Bulk workspace-tree reconcile: the client PUTs its whole Folder>Concept>Layout
// tree and the server upserts to match + deletes anything missing. Keeps the
// DB-backed client's save path to a single call.
export const WorkspaceTreeBody = z
  .object({
    activeId: z.string().nullable().optional(),
    folders: z.array(z.object({ id: z.string(), name: z.string(), parentId: z.string().nullable(), position: z.number().int(), archived: z.boolean().optional() })),
    concepts: z.array(z.object({ id: z.string(), name: z.string(), folderId: z.string().nullable(), position: z.number().int(), archived: z.boolean().optional() })),
    cells: z.array(z.object({ id: z.string(), name: z.string(), conceptId: z.string().nullable(), folderId: z.string().nullable(), position: z.number().int(), archived: z.boolean().optional(), model: ModelSchema })),
  })
  .openapi("WorkspaceTreeBody");

// Process library: entries are ProcessCatalogEntry payloads stored as JSON.
// teamId null = global seed catalog; teamId set = a team's custom entry.
const CatalogEntryPayload = z.record(z.string(), z.unknown());
export const CreateLibraryEntryBody = z.object({ entry: CatalogEntryPayload }).openapi("CreateLibraryEntryBody");
export const UpdateLibraryEntryBody = z.object({ entry: CatalogEntryPayload }).openapi("UpdateLibraryEntryBody");
export const LibraryEntry = z
  .object({ id: z.string(), teamId: z.string().nullable(), entry: CatalogEntryPayload })
  .openapi("LibraryEntryModel");

// Subflows: grouped elements (member stations + internal flows), team-scoped.
const SubflowData = z.record(z.string(), z.unknown());
export const CreateSubflowBody = z.object({ name: z.string().min(1), data: SubflowData }).openapi("CreateSubflowBody");
export const UpdateSubflowBody = z.object({ name: z.string().min(1).optional(), data: SubflowData.optional() }).openapi("UpdateSubflowBody");
export const Subflow = z
  .object({ id: z.string(), teamId: z.string(), name: z.string(), data: SubflowData })
  .openapi("SubflowModel");

// AI proxy bodies
export const AiModelBody = z.object({ model: ModelSchema }).openapi("AiModelBody");
export const AiEditBody = z
  .object({ model: ModelSchema, instruction: z.string().min(1) })
  .openapi("AiEditBody");
export const AiIngestBody = z.object({ text: z.string().min(1) }).openapi("AiIngestBody");
export const AiDesignBody = z.object({ brief: z.string().min(1) }).openapi("AiDesignBody");
export const AiIngestImageBody = z
  .object({ image: z.object({ data: z.string().min(1), mediaType: z.string().min(1) }) })
  .openapi("AiIngestImageBody");
export const AiOptimizeGoalBody = z
  .object({ model: ModelSchema, goal: z.any() })
  .openapi("AiOptimizeGoalBody");

export const AiCredentialBody = z
  .object({ provider: AiProviderIdEnum, model: z.string().min(1), apiKey: z.string().min(1) })
  .openapi("AiCredentialBody");

// ---- response component schemas ------------------------------------------

export const ErrorResponse = z
  .object({ error: z.string(), code: z.string() })
  .openapi("ErrorResponse");

export const User = z
  .object({ id: z.string(), email: z.string().email(), name: z.string().nullable() })
  .openapi("User");

export const Membership = z
  .object({ teamId: z.string(), role: RoleEnum, teamName: z.string() })
  .openapi("Membership");

export const TeamSummary = z
  .object({ id: z.string(), name: z.string(), createdAt: z.string().datetime() })
  .openapi("TeamSummary");

export const TeamWithMembers = z
  .object({
    id: z.string(),
    name: z.string(),
    memberships: z.array(
      z.object({
        userId: z.string(),
        role: RoleEnum,
        user: z.object({ email: z.string().email(), name: z.string().nullable() }),
      }),
    ),
  })
  .openapi("TeamWithMembers");

export const TeamMembership = z
  .object({ userId: z.string(), teamId: z.string(), role: RoleEnum })
  .openapi("TeamMembership");

export const WorkspaceSummary = z
  .object({
    id: z.string(),
    name: z.string(),
    activeId: z.string().nullable(),
    updatedAt: z.string().datetime(),
  })
  .openapi("WorkspaceSummary");

export const Folder = z
  .object({
    id: z.string(),
    name: z.string(),
    parentId: z.string().nullable(),
    position: z.number().int(),
  })
  .openapi("Folder");

export const Concept = z
  .object({
    id: z.string(),
    name: z.string(),
    folderId: z.string().nullable(),
    position: z.number().int(),
  })
  .openapi("Concept");

export const CellMeta = z
  .object({
    id: z.string(),
    name: z.string(),
    position: z.number().int(),
    folderId: z.string().nullable(),
    conceptId: z.string().nullable().optional(),
  })
  .openapi("CellMeta");

export const Cell = CellMeta.extend({ model: ModelSchema }).openapi("Cell");

export const Workspace = z
  .object({
    id: z.string(),
    name: z.string(),
    activeId: z.string().nullable(),
    folders: z.array(Folder),
    cells: z.array(Cell),
  })
  .openapi("Workspace");

export const ScenarioMeta = z
  .object({ name: z.string(), savedAt: z.string().datetime(), folderId: z.string().nullable() })
  .openapi("ScenarioMeta");

export const AiCredentialMeta = z
  .object({ provider: AiProviderIdEnum, model: z.string(), createdAt: z.string().datetime() })
  .openapi("AiCredentialMeta");
