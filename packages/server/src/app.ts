import path from "node:path";
import express, { type Express, type Router } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { ENV } from "./lib/env.ts";
import { errorHandler } from "./lib/http.ts";
import { authRouter } from "./routes/auth.ts";
import { teamsRouter } from "./routes/teams.ts";
import { workspacesRouter } from "./routes/workspaces.ts";
import { foldersRouter } from "./routes/folders.ts";
import { conceptsRouter } from "./routes/concepts.ts";
import { cellsRouter } from "./routes/cells.ts";
import { libraryRouter } from "./routes/library.ts";
import { subflowsRouter } from "./routes/subflows.ts";
import { scenariosRouter } from "./routes/scenarios.ts";
import { aiRouter } from "./routes/ai.ts";
import { aiCredentialsRouter } from "./routes/aiCredentials.ts";
import { buildOpenApiDocument } from "./openapi/document.ts";

// The mounted routers and their base paths. Exported so the OpenAPI drift test
// can introspect every live route and assert it's documented.
export const ROUTE_MOUNTS: { mount: string; router: Router }[] = [
  { mount: "/api/auth", router: authRouter },
  { mount: "/api/teams", router: teamsRouter },
  { mount: "/api", router: workspacesRouter },
  { mount: "/api", router: foldersRouter },
  { mount: "/api", router: conceptsRouter },
  { mount: "/api", router: cellsRouter },
  { mount: "/api", router: libraryRouter },
  { mount: "/api", router: subflowsRouter },
  { mount: "/api", router: scenariosRouter },
  { mount: "/api", router: aiRouter },
  { mount: "/api", router: aiCredentialsRouter },
];

// Build the Express app. Exported (separate from index.ts) so tests can mount it
// with a mocked Prisma client and no listening socket.
export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: ENV.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "4mb" })); // models + base64 images
  app.use(cookieParser());

  // Dev-only request log, so it is obvious in `npm run dev` that the app is
  // actually talking to the DB (and which endpoints each edit hits). Silent in
  // production and under tests.
  if (!ENV.isProd && process.env.NODE_ENV !== "test") {
    app.use((req, res, next) => {
      const t = Date.now();
      res.on("finish", () => {
        // eslint-disable-next-line no-console
        console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t}ms`);
      });
      next();
    });
  }

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Interactive API docs (public). The raw spec is generated from the same zod
  // schemas the routes validate against, so it can't drift. "Try it out" hits the
  // same origin, so the session cookie is sent automatically; API clients use the
  // Bearer token from /auth/login (persisted across reloads in the UI).
  const openapi = buildOpenApiDocument();
  app.get("/api/openapi.json", (_req, res) => res.json(openapi));
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: "FlowPlan API",
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  app.use("/api/auth", authRouter);
  app.use("/api/teams", teamsRouter);
  // Workspace/cell/scenario/AI routes mix /teams/:teamId/... and /workspaces/... and
  // /cells/... prefixes, so they mount at /api and own their full sub-paths.
  app.use("/api", workspacesRouter);
  app.use("/api", foldersRouter);
  app.use("/api", conceptsRouter);
  app.use("/api", cellsRouter);
  app.use("/api", libraryRouter);
  app.use("/api", subflowsRouter);
  app.use("/api", scenariosRouter);
  app.use("/api", aiRouter);
  app.use("/api", aiCredentialsRouter);

  // Single-origin deploy: also serve the built SPA so the web app's relative /api
  // calls resolve same-origin (no CORS/proxy). Gated on WEB_DIST so tests and the
  // dev API server stay API-only. The fallback returns index.html for non-/api
  // GETs so client routes and page refreshes work; /api/* 404s still hit
  // errorHandler as JSON.
  if (ENV.webDist) {
    app.use(express.static(ENV.webDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(ENV.webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
