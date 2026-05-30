import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { buildRating } from "@flowplan/core/engine/rating";
import { migrate } from "@flowplan/core/model/migrate";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest, notFound } from "../lib/http.ts";
import { asJson, migrateStored, versionOf } from "../lib/model.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";

export const cellsRouter = Router();
cellsRouter.use(requireAuth);

// A Model is a JSON object with stations[] and flows[]; migrate() fills the rest.
const modelSchema = z
  .object({ stations: z.array(z.unknown()), flows: z.array(z.unknown()) })
  .passthrough();

// Create a cell (covers addCell + duplicateCell — client sends the model to copy).
cellsRouter.post(
  "/workspaces/:wsId/cells",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ name: z.string().min(1), model: modelSchema }).safeParse(req.body);
    if (!body.success) throw badRequest("name and a valid model required");
    const model = migrate(body.data.model);
    const count = await getPrisma().cell.count({ where: { workspaceId: req.params.wsId } });
    const cell = await getPrisma().cell.create({
      data: { workspaceId: req.params.wsId, name: body.data.name, schemaVersion: versionOf(model), model: asJson(model), position: count },
      select: { id: true, name: true, position: true, model: true, schemaVersion: true },
    });
    res.status(201).json({ cell: { id: cell.id, name: cell.name, position: cell.position, model } });
  }),
);

cellsRouter.get(
  "/cells/:cellId",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const cell = await getPrisma().cell.findUnique({
      where: { id: req.params.cellId },
      select: { id: true, name: true, position: true, model: true, schemaVersion: true },
    });
    if (!cell) throw notFound();
    res.json({ cell: { id: cell.id, name: cell.name, position: cell.position, model: migrateStored(cell.model, cell.schemaVersion) } });
  }),
);

// The debounced autosave target. Re-runs the engine and returns the rating so the
// client can trust server-computed scores.
cellsRouter.put(
  "/cells/:cellId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ model: modelSchema }).safeParse(req.body);
    if (!body.success) throw badRequest("a valid model required");
    const model = migrate(body.data.model);
    const cell = await getPrisma().cell.update({
      where: { id: req.params.cellId },
      data: { model: asJson(model), schemaVersion: versionOf(model) },
      select: { id: true, name: true, position: true },
    });
    res.json({ cell: { ...cell, model }, rating: buildRating(model) });
  }),
);

cellsRouter.patch(
  "/cells/:cellId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z.object({ name: z.string().min(1).optional(), position: z.number().int().optional() }).safeParse(req.body);
    if (!body.success) throw badRequest("name or position required");
    const cell = await getPrisma().cell.update({
      where: { id: req.params.cellId },
      data: { name: body.data.name, position: body.data.position },
      select: { id: true, name: true, position: true },
    });
    res.json({ cell });
  }),
);

cellsRouter.delete(
  "/cells/:cellId",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    await getPrisma().cell.delete({ where: { id: req.params.cellId } });
    res.status(204).end();
  }),
);
