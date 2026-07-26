import { Router } from "express";
import { Role } from "@prisma/client";
import { blankModel } from "@flowplan/core/model/sample";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, notFound } from "../lib/http.ts";
import { asJson, migrateStored, versionOf } from "../lib/model.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { CreateWorkspaceBody, UpdateWorkspaceBody } from "../openapi/schemas.ts";

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
        folders: { orderBy: { position: "asc" }, select: { id: true, name: true, parentId: true, position: true } },
        cells: { orderBy: { position: "asc" }, select: { id: true, name: true, folderId: true, model: true, schemaVersion: true, position: true } },
      },
    });
    if (!ws) throw notFound();
    res.json({
      workspace: {
        id: ws.id,
        name: ws.name,
        activeId: ws.activeId,
        folders: ws.folders,
        cells: ws.cells.map((c) => ({ id: c.id, name: c.name, position: c.position, folderId: c.folderId, model: migrateStored(c.model, c.schemaVersion) })),
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

workspacesRouter.delete(
  "/workspaces/:wsId",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    await getPrisma().workspace.delete({ where: { id: req.params.wsId } });
    res.status(204).end();
  }),
);
