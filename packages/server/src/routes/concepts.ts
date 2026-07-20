import { Router } from "express";
import { Role } from "@prisma/client";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, notFound } from "../lib/http.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { CreateConceptBody, UpdateConceptBody } from "../openapi/schemas.ts";

// Concepts are the workspace item: each holds one or more layouts (cells). This
// mirrors the folders router. Deleting a concept cascades to its cells (Prisma
// onDelete: Cascade), because a layout can't exist without a concept.
export const conceptsRouter = Router();
conceptsRouter.use(requireAuth);

const conceptView = { id: true, name: true, folderId: true, position: true } as const;

// Create a concept, optionally inside a folder. position = sibling count.
conceptsRouter.post(
  "/workspaces/:wsId/concepts",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = CreateConceptBody.safeParse(req.body);
    if (!body.success) throw badRequest("name required");
    const prisma = getPrisma();
    const folderId = body.data.folderId ?? null;
    if (folderId) {
      const folder = await prisma.folder.findFirst({ where: { id: folderId, workspaceId: req.params.wsId }, select: { id: true } });
      if (!folder) throw notFound("Folder not found in this workspace");
    }
    const position = await prisma.concept.count({ where: { workspaceId: req.params.wsId, folderId } });
    const concept = await prisma.concept.create({
      data: { workspaceId: req.params.wsId, folderId, name: body.data.name, position },
      select: conceptView,
    });
    res.status(201).json({ concept });
  }),
);

// Rename / move / reorder a concept. Moving into a folder moves its layouts with it.
conceptsRouter.patch(
  "/concepts/:conceptId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = UpdateConceptBody.safeParse(req.body);
    if (!body.success) throw badRequest("name, folderId or position required");
    const prisma = getPrisma();
    const conceptId = req.params.conceptId;
    const concept = await prisma.concept.update({
      where: { id: conceptId },
      data: { name: body.data.name, folderId: body.data.folderId, position: body.data.position },
      select: conceptView,
    });
    // Layouts follow the concept into its new folder.
    if (body.data.folderId !== undefined) {
      await prisma.cell.updateMany({ where: { conceptId }, data: { folderId: body.data.folderId } });
    }
    res.json({ concept });
  }),
);

// Delete a concept; its cells cascade (onDelete: Cascade on Cell.concept).
conceptsRouter.delete(
  "/concepts/:conceptId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const prisma = getPrisma();
    const concept = await prisma.concept.findUnique({ where: { id: req.params.conceptId }, select: { id: true } });
    if (!concept) throw notFound();
    await prisma.concept.delete({ where: { id: req.params.conceptId } });
    res.status(204).end();
  }),
);
