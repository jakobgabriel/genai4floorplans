import { Router } from "express";
import { z } from "zod";
import { AiProviderId, Role } from "@prisma/client";
import { getPrisma } from "../lib/prisma.ts";
import { asyncHandler, badRequest } from "../lib/http.ts";
import { encryptSecret } from "../lib/crypto.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireTeamRole } from "../middleware/requireTeamRole.ts";
import type { AuthedRequest } from "../middleware/types.ts";

export const aiCredentialsRouter = Router();
aiCredentialsRouter.use(requireAuth);

// Store/replace a team's AI provider key (write-only — never returned). OWNER only.
aiCredentialsRouter.put(
  "/teams/:teamId/ai/credentials",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = z
      .object({ provider: z.nativeEnum(AiProviderId), model: z.string().min(1), apiKey: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) throw badRequest("provider, model and apiKey required");
    const sealed = encryptSecret(body.data.apiKey);
    await getPrisma().teamAiCredential.upsert({
      where: { teamId_provider: { teamId: req.teamId!, provider: body.data.provider } },
      create: {
        teamId: req.teamId!,
        provider: body.data.provider,
        model: body.data.model,
        keyCiphertext: sealed.ciphertext,
        keyIv: sealed.iv,
        keyTag: sealed.tag,
      },
      update: { model: body.data.model, keyCiphertext: sealed.ciphertext, keyIv: sealed.iv, keyTag: sealed.tag },
    });
    res.status(204).end();
  }),
);

// List which providers are configured (no secrets) so the admin UI can show status.
aiCredentialsRouter.get(
  "/teams/:teamId/ai/credentials",
  requireTeamRole(Role.OWNER),
  asyncHandler(async (req: AuthedRequest, res) => {
    const creds = await getPrisma().teamAiCredential.findMany({
      where: { teamId: req.teamId },
      select: { provider: true, model: true, createdAt: true },
    });
    res.json({ credentials: creds });
  }),
);
