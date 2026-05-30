import { Router } from "express";
import { Role } from "@prisma/client";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, notFound } from "../lib/http.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { CreateTeamBody, UpdateTeamBody, MemberBody, UpdateMemberBody } from "../openapi/schemas.ts";

export const teamsRouter = Router();
teamsRouter.use(requireAuth);

// List teams the caller belongs to.
teamsRouter.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const teams = await getPrisma().team.findMany({
      where: { memberships: { some: { userId: req.userId } } },
      select: { id: true, name: true, createdAt: true },
    });
    res.json({ teams });
  }),
);

// Create a team; the creator becomes OWNER.
teamsRouter.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = CreateTeamBody.safeParse(req.body);
    if (!body.success) throw badRequest("name required");
    const team = await getPrisma().team.create({
      data: {
        name: body.data.name,
        memberships: { create: { userId: req.userId!, role: Role.OWNER } },
      },
      select: { id: true, name: true, createdAt: true },
    });
    res.status(201).json({ team });
  }),
);

teamsRouter.get(
  "/:teamId",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const team = await getPrisma().team.findUnique({
      where: { id: req.teamId },
      select: {
        id: true,
        name: true,
        memberships: { select: { userId: true, role: true, user: { select: { email: true, name: true } } } },
      },
    });
    if (!team) throw notFound();
    res.json({ team });
  }),
);

teamsRouter.patch(
  "/:teamId",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = UpdateTeamBody.safeParse(req.body);
    if (!body.success) throw badRequest("name required");
    const team = await getPrisma().team.update({
      where: { id: req.teamId },
      data: { name: body.data.name },
      select: { id: true, name: true },
    });
    res.json({ team });
  }),
);

teamsRouter.delete(
  "/:teamId",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    await getPrisma().team.delete({ where: { id: req.teamId } });
    res.status(204).end();
  }),
);

// --- membership management (OWNER only) ---
teamsRouter.post(
  "/:teamId/members",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = MemberBody.safeParse(req.body);
    if (!body.success) throw badRequest("email and role required");
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email: body.data.email }, select: { id: true } });
    if (!user) throw notFound("No user with that email");
    const membership = await prisma.membership.upsert({
      where: { userId_teamId: { userId: user.id, teamId: req.teamId! } },
      create: { userId: user.id, teamId: req.teamId!, role: body.data.role },
      update: { role: body.data.role },
      select: { userId: true, teamId: true, role: true },
    });
    res.status(201).json({ membership });
  }),
);

teamsRouter.patch(
  "/:teamId/members/:userId",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = UpdateMemberBody.safeParse(req.body);
    if (!body.success) throw badRequest("role required");
    const membership = await getPrisma().membership.update({
      where: { userId_teamId: { userId: req.params.userId, teamId: req.teamId! } },
      data: { role: body.data.role },
      select: { userId: true, teamId: true, role: true },
    });
    res.json({ membership });
  }),
);

teamsRouter.delete(
  "/:teamId/members/:userId",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    await getPrisma().membership.delete({
      where: { userId_teamId: { userId: req.params.userId, teamId: req.teamId! } },
    });
    res.status(204).end();
  }),
);
