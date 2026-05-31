import { Router } from "express";
import { Role } from "@prisma/client";
import { migrate } from "@flowplan/core/model/migrate";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, notFound } from "../lib/http.ts";
import { asJson, migrateStored, versionOf } from "../lib/model.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { ScenarioModelBody, MoveScenarioBody } from "../openapi/schemas.ts";

export const scenariosRouter = Router();
scenariosRouter.use(requireAuth);

// List scenario metadata (name + savedAt) — mirrors listScenarios().
scenariosRouter.get(
  "/workspaces/:wsId/scenarios",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const scenarios = await getPrisma().scenario.findMany({
      where: { workspaceId: req.params.wsId },
      orderBy: { savedAt: "desc" },
      select: { name: true, savedAt: true, folderId: true },
    });
    res.json({ scenarios });
  }),
);

// Upsert a named variant — mirrors saveScenario(name, model).
scenariosRouter.put(
  "/workspaces/:wsId/scenarios/:name",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = ScenarioModelBody.safeParse(req.body);
    if (!body.success) throw badRequest("a valid model required");
    const model = migrate({ ...body.data.model, name: req.params.name });
    const scenario = await getPrisma().scenario.upsert({
      where: { workspaceId_name: { workspaceId: req.params.wsId, name: req.params.name } },
      create: { workspaceId: req.params.wsId, name: req.params.name, schemaVersion: versionOf(model), model: asJson(model) },
      update: { schemaVersion: versionOf(model), model: asJson(model), savedAt: new Date() },
      select: { name: true, savedAt: true, folderId: true },
    });
    res.json({ scenario });
  }),
);

// Move a scenario into a folder (or back to root with folderId: null).
scenariosRouter.patch(
  "/workspaces/:wsId/scenarios/:name",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = MoveScenarioBody.safeParse(req.body);
    if (!body.success) throw badRequest("folderId required");
    const scenario = await getPrisma().scenario.update({
      where: { workspaceId_name: { workspaceId: req.params.wsId, name: req.params.name } },
      data: { folderId: body.data.folderId },
      select: { name: true, savedAt: true, folderId: true },
    });
    res.json({ scenario });
  }),
);

scenariosRouter.get(
  "/workspaces/:wsId/scenarios/:name",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const scenario = await getPrisma().scenario.findUnique({
      where: { workspaceId_name: { workspaceId: req.params.wsId, name: req.params.name } },
      select: { model: true, schemaVersion: true },
    });
    if (!scenario) throw notFound();
    res.json({ model: migrateStored(scenario.model, scenario.schemaVersion) });
  }),
);

scenariosRouter.delete(
  "/workspaces/:wsId/scenarios/:name",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    await getPrisma().scenario.delete({
      where: { workspaceId_name: { workspaceId: req.params.wsId, name: req.params.name } },
    });
    res.status(204).end();
  }),
);
