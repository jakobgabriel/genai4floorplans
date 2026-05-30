import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./registry.ts";

// Build the OpenAPI 3.0 document from the shared registry (single source of
// truth — the same zod schemas the routes validate against). Cheap to call;
// the app generates it once at mount time.
export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "FlowPlan API",
      version: "0.1.0",
      description:
        "Multi-tenant API for FlowPlan (teams, workspaces, cells, scenarios, and a server-side AI proxy). " +
        "Authenticate via the session cookie (set by /auth/login) or an `Authorization: Bearer <token>` header " +
        "using the token returned by /auth/login or /auth/register.",
    },
    servers: [{ url: "/", description: "Same origin as the docs" }],
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    tags: [
      { name: "System" },
      { name: "Auth" },
      { name: "Teams" },
      { name: "Members" },
      { name: "Workspaces" },
      { name: "Cells" },
      { name: "Scenarios" },
      { name: "AI" },
      { name: "AI Credentials" },
    ],
  });
}
