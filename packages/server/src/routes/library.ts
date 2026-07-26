import { Router } from "express";
import { Role, type Prisma } from "@prisma/client";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, notFound } from "../lib/http.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { CreateLibraryEntryBody, UpdateLibraryEntryBody } from "../openapi/schemas.ts";

// The process library. Global entries (teamId null) are the shared seed catalog;
// team entries are a team's own custom building blocks. All routes are scoped
// under /teams/:teamId so requireTeamRole resolves the team from the path.
export const libraryRouter = Router();
libraryRouter.use(requireAuth);

const view = (e: { id: string; teamId: string | null; entry: Prisma.JsonValue }) => ({ id: e.id, teamId: e.teamId, entry: e.entry });

// List the global catalog + this team's custom entries.
libraryRouter.get(
  "/teams/:teamId/library",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const entries = await getPrisma().libraryEntry.findMany({
      where: { OR: [{ teamId: null }, { teamId: req.params.teamId }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, teamId: true, entry: true },
    });
    res.json({ entries: entries.map(view) });
  }),
);

// Create a custom entry for this team.
libraryRouter.post(
  "/teams/:teamId/library",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = CreateLibraryEntryBody.safeParse(req.body);
    if (!body.success) throw badRequest("entry required");
    const created = await getPrisma().libraryEntry.create({
      data: { teamId: req.params.teamId, entry: body.data.entry as Prisma.InputJsonValue },
      select: { id: true, teamId: true, entry: true },
    });
    res.status(201).json({ entry: view(created) });
  }),
);

// Update a custom entry (global seed entries are read-only).
libraryRouter.patch(
  "/teams/:teamId/library/:entryId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = UpdateLibraryEntryBody.safeParse(req.body);
    if (!body.success) throw badRequest("entry required");
    const existing = await getPrisma().libraryEntry.findFirst({ where: { id: req.params.entryId, teamId: req.params.teamId }, select: { id: true } });
    if (!existing) throw notFound("Custom entry not found for this team");
    const updated = await getPrisma().libraryEntry.update({
      where: { id: req.params.entryId },
      data: { entry: body.data.entry as Prisma.InputJsonValue },
      select: { id: true, teamId: true, entry: true },
    });
    res.json({ entry: view(updated) });
  }),
);

libraryRouter.delete(
  "/teams/:teamId/library/:entryId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await getPrisma().libraryEntry.findFirst({ where: { id: req.params.entryId, teamId: req.params.teamId }, select: { id: true } });
    if (!existing) throw notFound("Custom entry not found for this team");
    await getPrisma().libraryEntry.delete({ where: { id: req.params.entryId } });
    res.status(204).end();
  }),
);
