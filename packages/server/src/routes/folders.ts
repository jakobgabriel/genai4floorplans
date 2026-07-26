import { Router } from "express";
import { Role } from "@prisma/client";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, notFound } from "../lib/http.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { CreateFolderBody, UpdateFolderBody } from "../openapi/schemas.ts";

export const foldersRouter = Router();
foldersRouter.use(requireAuth);

const folderView = { id: true, name: true, parentId: true, position: true } as const;

// Walk a folder's parent chain; true if `ancestorId` is the folder itself or any
// of its ancestors — used to reject moving a folder into its own subtree (cycle).
async function wouldCycle(folderId: string, newParentId: string): Promise<boolean> {
  const prisma = getPrisma();
  let cursor: string | null = newParentId;
  while (cursor) {
    if (cursor === folderId) return true;
    const parent: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

// Create a folder, optionally nested under parentId. position = sibling count.
foldersRouter.post(
  "/workspaces/:wsId/folders",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = CreateFolderBody.safeParse(req.body);
    if (!body.success) throw badRequest("name required");
    const prisma = getPrisma();
    const parentId = body.data.parentId ?? null;
    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, workspaceId: req.params.wsId },
        select: { id: true },
      });
      if (!parent) throw notFound("Parent folder not found in this workspace");
    }
    const position = await prisma.folder.count({ where: { workspaceId: req.params.wsId, parentId } });
    const folder = await prisma.folder.create({
      data: { workspaceId: req.params.wsId, parentId, name: body.data.name, position },
      select: folderView,
    });
    res.status(201).json({ folder });
  }),
);

// Rename / move / reorder a folder. Moving into its own descendant is rejected.
foldersRouter.patch(
  "/folders/:folderId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = UpdateFolderBody.safeParse(req.body);
    if (!body.success) throw badRequest("name, parentId or position required");
    const prisma = getPrisma();
    const folderId = req.params.folderId;

    if (body.data.parentId !== undefined) {
      const parentId = body.data.parentId;
      if (parentId === folderId) throw badRequest("A folder cannot be its own parent");
      if (parentId && (await wouldCycle(folderId, parentId))) {
        throw badRequest("Cannot move a folder into its own descendant");
      }
    }
    const folder = await prisma.folder.update({
      where: { id: folderId },
      data: { name: body.data.name, parentId: body.data.parentId, position: body.data.position },
      select: folderView,
    });
    res.json({ folder });
  }),
);

// Delete a folder, reparenting its child folders + cells + scenarios up one level
// (to this folder's parent) first, so nothing inside is lost.
foldersRouter.delete(
  "/folders/:folderId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const prisma = getPrisma();
    const folderId = req.params.folderId;
    const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { parentId: true } });
    if (!folder) throw notFound();
    const parentId = folder.parentId;
    await prisma.$transaction([
      prisma.folder.updateMany({ where: { parentId: folderId }, data: { parentId } }),
      prisma.concept.updateMany({ where: { folderId }, data: { folderId: parentId } }),
      prisma.cell.updateMany({ where: { folderId }, data: { folderId: parentId } }),
      prisma.scenario.updateMany({ where: { folderId }, data: { folderId: parentId } }),
      prisma.folder.delete({ where: { id: folderId } }),
    ]);
    res.status(204).end();
  }),
);
