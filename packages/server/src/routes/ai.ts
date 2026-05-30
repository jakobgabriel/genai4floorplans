import { Router } from "express";
import { Role, type AiCapability } from "@prisma/client";
import type { Model } from "@flowplan/core/model/types";
import type { ProposalContext } from "@flowplan/core/ai/types";
import { buildRating } from "@flowplan/core/engine/rating";
import { validateFlow } from "@flowplan/core/engine/validate";
import { chainRating } from "@flowplan/core/engine/automation";
import { migrate } from "@flowplan/core/model/migrate";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest } from "../lib/http.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { resolveTeamProvider } from "../ai/resolveTeamProvider.ts";
import { AiModelBody, AiEditBody, AiIngestBody, AiDesignBody, AiIngestImageBody, AiOptimizeGoalBody } from "../openapi/schemas.ts";

export const aiRouter = Router();
aiRouter.use(requireAuth);

// Build the full ProposalContext from just a model so the client can't spoof
// scores — the engine recomputes rating/validation/chain server-side.
function contextOf(model: Model): ProposalContext {
  return {
    model,
    rating: buildRating(model),
    validation: validateFlow(model.stations, model.flows),
    chain: chainRating(model.stations, model.flows),
  };
}

// Run an AI capability through the team's provider, log usage, and return the
// result. The provider/core already re-scores any model output via the engine.
async function runAi<T>(
  req: AuthedRequest,
  capability: AiCapability,
  fn: (provider: Awaited<ReturnType<typeof resolveTeamProvider>>["provider"]) => Promise<T>,
): Promise<T> {
  const resolved = await resolveTeamProvider(req.teamId!);
  const start = Date.now();
  let ok = false;
  let errorCode: string | undefined;
  try {
    const result = await fn(resolved.provider);
    ok = true;
    return result;
  } catch (e) {
    errorCode = e instanceof Error ? e.message.slice(0, 120) : "error";
    throw e;
  } finally {
    if (resolved.provider_id) {
      await getPrisma()
        .aiUsageLog.create({
          data: {
            teamId: req.teamId!,
            userId: req.userId!,
            provider: resolved.provider_id,
            capability,
            model: resolved.model,
            ok,
            latencyMs: Date.now() - start,
            errorCode,
          },
        })
        .catch(() => {});
    }
  }
}

aiRouter.post(
  "/teams/:teamId/ai/propose",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = AiModelBody.safeParse(req.body);
    if (!body.success) throw badRequest("model required");
    const proposals = await runAi(req, "PROPOSE", (p) => p.propose(contextOf(migrate(body.data.model))));
    res.json({ proposals });
  }),
);

aiRouter.post(
  "/teams/:teamId/ai/narrate",
  requireTeamRole(Role.VIEWER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = AiModelBody.safeParse(req.body);
    if (!body.success) throw badRequest("model required");
    const narration = await runAi(req, "NARRATE", (p) => p.narrate(contextOf(migrate(body.data.model))));
    res.json({ narration });
  }),
);

aiRouter.post(
  "/teams/:teamId/ai/edit",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = AiEditBody.safeParse(req.body);
    if (!body.success) throw badRequest("model and instruction required");
    const result = await runAi(req, "EDIT", (p) => p.edit(contextOf(migrate(body.data.model)), body.data.instruction));
    res.json({ result });
  }),
);

aiRouter.post(
  "/teams/:teamId/ai/ingest",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = AiIngestBody.safeParse(req.body);
    if (!body.success) throw badRequest("text required");
    const model = await runAi(req, "INGEST", (p) => p.ingest(body.data.text));
    res.json({ model });
  }),
);

aiRouter.post(
  "/teams/:teamId/ai/design",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = AiDesignBody.safeParse(req.body);
    if (!body.success) throw badRequest("brief required");
    const model = await runAi(req, "DESIGN", (p) => p.design(body.data.brief));
    res.json({ model });
  }),
);

aiRouter.post(
  "/teams/:teamId/ai/ingest-image",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = AiIngestImageBody.safeParse(req.body);
    if (!body.success) throw badRequest("image {data, mediaType} required");
    const model = await runAi(req, "INGEST_IMAGE", (p) => p.ingestImage(body.data.image));
    res.json({ model });
  }),
);

aiRouter.post(
  "/teams/:teamId/ai/optimize-goal",
  requireTeamRole(Role.EDITOR),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = AiOptimizeGoalBody.safeParse(req.body);
    if (!body.success) throw badRequest("model and goal required");
    const result = await runAi(req, "OPTIMIZE_GOAL", (p) =>
      p.optimizeGoal(contextOf(migrate(body.data.model)), body.data.goal as never),
    );
    res.json({ result });
  }),
);
