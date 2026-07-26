// Emit the server's OpenAPI document to the docs site's static folder, so the
// REST API reference is generated from the SAME zod schemas the routes validate
// against (single source of truth) — not hand-written. Run with tsx.
import { writeFileSync, mkdirSync } from "node:fs";
import { buildOpenApiDocument } from "../packages/server/src/openapi/document.ts";

const out = "docs-site/static/openapi.json";
mkdirSync("docs-site/static", { recursive: true });
writeFileSync(out, JSON.stringify(buildOpenApiDocument(), null, 2));
console.log(`emit-openapi: wrote ${out}`);
