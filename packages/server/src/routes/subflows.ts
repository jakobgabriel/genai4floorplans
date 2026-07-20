import { Router } from "express";
import { Role, type Prisma } from "@prisma/client";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, notFound } from "../lib/http.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { CreateSubflowBody, UpdateSubflowBody } from "../openapi/schemas.ts";

// Grouped/subflow elements, team-scoped. Routes are under /teams/:teamId so
// requireTeamRole resolves the team from the path.
export const subflowsRouter = Router();
subflowsRouter.use(requireAuth);

const view = (s: { id: string; teamId: string; name: string; data: Prisma.JsonValue }) => ({ id: s.id, teamId: s.teamId, name: s.name, data: s.data });

subflowsRouter.get(
  "/teams/:teamId/subflows",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const subflows = await getPrisma().subflow.findMany({
      where: { teamId: req.params.teamId },
      orderBy: { createdAt: "asc" },
      select: { id: true, teamId: true, name: true, data: true },
    });
    res.json({ subflows: subflows.map(view) });
  }),
);

subflowsRouter.post(
  "/teams/:teamId/subflows",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = CreateSubflowBody.safeParse(req.body);
    if (!body.success) throw badRequest("name and data required");
    const created = await getPrisma().subflow.create({
      data: { teamId: req.params.teamId, name: body.data.name, data: body.data.data as Prisma.InputJsonValue },
      select: { id: true, teamId: true, name: true, data: true },
    });
    res.status(201).json({ subflow: view(created) });
  }),
);

subflowsRouter.patch(
  "/teams/:teamId/subflows/:subflowId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = UpdateSubflowBody.safeParse(req.body);
    if (!body.success) throw badRequest("name or data required");
    const existing = await getPrisma().subflow.findFirst({ where: { id: req.params.subflowId, teamId: req.params.teamId }, select: { id: true } });
    if (!existing) throw notFound();
    const updated = await getPrisma().subflow.update({
      where: { id: req.params.subflowId },
      data: { name: body.data.name, data: body.data.data as Prisma.InputJsonValue | undefined },
      select: { id: true, teamId: true, name: true, data: true },
    });
    res.json({ subflow: view(updated) });
  }),
);

subflowsRouter.delete(
  "/teams/:teamId/subflows/:subflowId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const existing = await getPrisma().subflow.findFirst({ where: { id: req.params.subflowId, teamId: req.params.teamId }, select: { id: true } });
    if (!existing) throw notFound();
    await getPrisma().subflow.delete({ where: { id: req.params.subflowId } });
    res.status(204).end();
  }),
);
