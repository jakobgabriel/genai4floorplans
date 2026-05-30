import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { ENV } from "./lib/env.ts";
import { errorHandler } from "./lib/http.ts";
import { authRouter } from "./routes/auth.ts";
import { teamsRouter } from "./routes/teams.ts";
import { workspacesRouter } from "./routes/workspaces.ts";
import { cellsRouter } from "./routes/cells.ts";
import { scenariosRouter } from "./routes/scenarios.ts";
import { aiRouter } from "./routes/ai.ts";
import { aiCredentialsRouter } from "./routes/aiCredentials.ts";

// Build the Express app. Exported (separate from index.ts) so tests can mount it
// with a mocked Prisma client and no listening socket.
export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: ENV.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "4mb" })); // models + base64 images
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/teams", teamsRouter);
  // Workspace/cell/scenario/AI routes mix /teams/:teamId/... and /workspaces/... and
  // /cells/... prefixes, so they mount at /api and own their full sub-paths.
  app.use("/api", workspacesRouter);
  app.use("/api", cellsRouter);
  app.use("/api", scenariosRouter);
  app.use("/api", aiRouter);
  app.use("/api", aiCredentialsRouter);

  app.use(errorHandler);
  return app;
}
