import { Router } from "express";
import { Role } from "@prisma/client";
import { blankModel } from "@flowplan/core/model/sample";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, conflict, notFound } from "../lib/http.ts";
import { asJson, migrateStored, versionOf } from "../lib/model.ts";
import { migrate } from "@flowplan/core/model/migrate";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { CreateWorkspaceBody, UpdateWorkspaceBody, WorkspaceTreeBody } from "../openapi/schemas.ts";

export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

// List a team's workspaces.
workspacesRouter.get(
  "/teams/:teamId/workspaces",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const workspaces = await getPrisma().workspace.findMany({
      where: { teamId: req.teamId },
      select: { id: true, name: true, activeId: true, updatedAt: true },
    });
    res.json({ workspaces });
  }),
);

// Create a workspace seeded with one blank cell (mirrors first-run client state).
workspacesRouter.post(
  "/teams/:teamId/workspaces",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = CreateWorkspaceBody.safeParse(req.body);
    if (!body.success) throw badRequest("name required");
    const model = blankModel();
    const prisma = getPrisma();
    const ws = await prisma.workspace.create({
      data: { teamId: req.teamId!, name: body.data.name },
      select: { id: true, name: true },
    });
    const cell = await prisma.cell.create({
      data: { workspaceId: ws.id, name: model.name || "Cell 1", schemaVersion: versionOf(model), model: asJson(model) },
      select: { id: true },
    });
    await prisma.workspace.update({ where: { id: ws.id }, data: { activeId: cell.id } });
    res.status(201).json({ workspace: { id: ws.id, name: ws.name, activeId: cell.id } });
  }),
);

// Full hydrate — mirrors the client loadWorkspace(): all cells (migrated) + activeId.
workspacesRouter.get(
  "/workspaces/:wsId",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const ws = await getPrisma().workspace.findUnique({
      where: { id: req.params.wsId },
      select: {
        id: true,
        name: true,
        activeId: true,
        version: true,
        folders: { orderBy: { position: "asc" }, select: { id: true, name: true, parentId: true, position: true, archived: true } },
        concepts: { orderBy: { position: "asc" }, select: { id: true, name: true, folderId: true, position: true, archived: true } },
        cells: { orderBy: { position: "asc" }, select: { id: true, name: true, folderId: true, conceptId: true, model: true, schemaVersion: true, position: true, archived: true } },
      },
    });
    if (!ws) throw notFound();
    res.json({
      workspace: {
        id: ws.id,
        name: ws.name,
        activeId: ws.activeId,
        version: ws.version,
        folders: ws.folders,
        concepts: ws.concepts,
        cells: ws.cells.map((c) => ({ id: c.id, name: c.name, position: c.position, folderId: c.folderId, conceptId: c.conceptId, archived: c.archived, model: migrateStored(c.model, c.schemaVersion) })),
      },
    });
  }),
);

workspacesRouter.patch(
  "/workspaces/:wsId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = UpdateWorkspaceBody.safeParse(req.body);
    if (!body.success) throw badRequest("name or activeId required");
    const ws = await getPrisma().workspace.update({
      where: { id: req.params.wsId },
      data: { name: body.data.name, activeId: body.data.activeId },
      select: { id: true, name: true, activeId: true },
    });
    res.json({ workspace: ws });
  }),
);

// Bulk reconcile the whole Folder>Concept>Layout tree to match the client. One
// transaction: upsert every folder/concept/cell by id (order-safe: folders,
// then concepts, then cells so FKs resolve), delete anything the client dropped,
// and set activeId. This is the DB-backed client's single save path.
workspacesRouter.put(
  "/workspaces/:wsId/tree",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = WorkspaceTreeBody.safeParse(req.body);
    if (!body.success) throw badRequest("folders, concepts and cells required");
    const wsId = req.params.wsId;
    const { folders, concepts, cells, activeId, baseVersion } = body.data;
    const prisma = getPrisma();
    const keepFolders = folders.map((f) => f.id);
    const keepConcepts = concepts.map((c) => c.id);
    const keepCells = cells.map((c) => c.id);

    // One interactive transaction so the optimistic-concurrency guard and the
    // tree writes commit (or roll back) together. When the client sends the
    // baseVersion it loaded, we bump version only if it still matches; a mismatch
    // means someone else saved in the meantime, so we reject (409) and write
    // nothing rather than clobber their edit. The bump + writes being atomic is
    // what makes a rejected save safe to retry with a reloaded baseVersion.
    const version = await prisma.$transaction(async (tx) => {
      if (typeof baseVersion === "number") {
        const bumped = await tx.workspace.updateMany({ where: { id: wsId, version: baseVersion }, data: { version: { increment: 1 } } });
        if (bumped.count === 0) throw conflict("This workspace changed elsewhere since you loaded it.");
      }
      // Delete removed rows first (cells, then concepts, then folders) to avoid FK conflicts.
      await tx.cell.deleteMany({ where: { workspaceId: wsId, id: { notIn: keepCells.length ? keepCells : ["__none__"] } } });
      await tx.concept.deleteMany({ where: { workspaceId: wsId, id: { notIn: keepConcepts.length ? keepConcepts : ["__none__"] } } });
      await tx.folder.deleteMany({ where: { workspaceId: wsId, id: { notIn: keepFolders.length ? keepFolders : ["__none__"] } } });
      // Upsert folders, then concepts, then cells so FKs resolve.
      for (const f of folders) {
        await tx.folder.upsert({
          where: { id: f.id },
          create: { id: f.id, workspaceId: wsId, name: f.name, parentId: f.parentId, position: f.position, archived: f.archived ?? false },
          update: { name: f.name, parentId: f.parentId, position: f.position, archived: f.archived ?? false },
        });
      }
      for (const c of concepts) {
        await tx.concept.upsert({
          where: { id: c.id },
          create: { id: c.id, workspaceId: wsId, name: c.name, folderId: c.folderId, position: c.position, archived: c.archived ?? false },
          update: { name: c.name, folderId: c.folderId, position: c.position, archived: c.archived ?? false },
        });
      }
      for (const c of cells) {
        const model = migrate(c.model);
        await tx.cell.upsert({
          where: { id: c.id },
          create: { id: c.id, workspaceId: wsId, conceptId: c.conceptId, folderId: c.folderId, name: c.name, position: c.position, archived: c.archived ?? false, schemaVersion: versionOf(model), model: asJson(model) },
          update: { conceptId: c.conceptId, folderId: c.folderId, name: c.name, position: c.position, archived: c.archived ?? false, schemaVersion: versionOf(model), model: asJson(model) },
        });
      }
      const ws = await tx.workspace.update({ where: { id: wsId }, data: { activeId: activeId ?? null }, select: { version: true } });
      return ws.version;
    });
    res.json({ ok: true, version });
  }),
);

workspacesRouter.delete(
  "/workspaces/:wsId",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    await getPrisma().workspace.delete({ where: { id: req.params.wsId } });
    res.status(204).end();
  }),
);
