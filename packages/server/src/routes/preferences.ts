import { Router } from "express";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest } from "../lib/http.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { PreferencesBody } from "../openapi/schemas.ts";

// Per-user application + UI preferences (theme, panel layout, non-secret AI
// choice). One row per user, a free-form JSON blob so the client owns the shape.
export const preferencesRouter = Router();
preferencesRouter.use(requireAuth);

// Read the caller's preferences (empty object when none saved yet).
preferencesRouter.get(
  "/me/preferences",
  asyncHandler(async (req: AuthedRequest, res) => {
    const row = await getPrisma().userPreference.findUnique({
      where: { userId: req.userId! },
      select: { prefs: true },
    });
    res.json({ prefs: row?.prefs ?? {} });
  }),
);

// Replace the caller's preferences blob.
preferencesRouter.put(
  "/me/preferences",
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = PreferencesBody.safeParse(req.body);
    if (!body.success) throw badRequest("a prefs object is required");
    const prefs = body.data.prefs as object;
    const row = await getPrisma().userPreference.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, prefs },
      update: { prefs },
      select: { prefs: true },
    });
    res.json({ prefs: row.prefs });
  }),
);
