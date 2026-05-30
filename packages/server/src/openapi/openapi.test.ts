import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Router } from "express";
import { signSession } from "../lib/jwt.ts";
import { createApp, ROUTE_MOUNTS } from "../app.ts";
import { buildOpenApiDocument } from "./document.ts";
import { installMockPrisma, resetPrisma } from "../test/mockPrisma.ts";

// Enumerate every live Express route from the mounted routers: each router's
// stack has `layer.route` entries with the sub-path + methods. Prefix with the
// mount and normalize Express `:param` -> OpenAPI `{param}`.
function liveRoutes(): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  const norm = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  for (const { mount, router } of ROUTE_MOUNTS) {
    // express Router keeps layers on `.stack`
    const stack = (router as Router & { stack: any[] }).stack;
    for (const layer of stack) {
      if (!layer.route) continue;
      const sub = layer.route.path as string;
      const full = norm((mount + sub).replace(/\/$/, "")) || "/";
      for (const m of Object.keys(layer.route.methods)) {
        if (m === "_all") continue;
        out.push({ method: m.toUpperCase(), path: full });
      }
    }
  }
  // health is registered directly on the app, not a router
  out.push({ method: "GET", path: "/api/health" });
  return out;
}

describe("OpenAPI document", () => {
  const doc = buildOpenApiDocument();

  it("generates a valid OpenAPI 3.0 document", () => {
    expect(doc.openapi).toMatch(/^3\.0/);
    expect(doc.info.title).toBe("FlowPlan API");
    expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(15);
  });

  it("declares both cookie and bearer security schemes", () => {
    const schemes = doc.components?.securitySchemes ?? {};
    expect(schemes.cookieAuth).toMatchObject({ type: "apiKey", in: "cookie", name: "flowplan_session" });
    expect(schemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
  });

  it("documents an ErrorResponse component and Model schema", () => {
    const schemas = doc.components?.schemas ?? {};
    expect(schemas.ErrorResponse).toBeDefined();
    expect(schemas.Model).toBeDefined();
  });

  // Drift guard: every route the server actually serves must appear in the spec.
  it("documents every live route (no drift)", () => {
    const paths = doc.paths ?? {};
    const missing: string[] = [];
    for (const { method, path } of liveRoutes()) {
      const item = (paths as Record<string, Record<string, unknown>>)[path];
      if (!item || !item[method.toLowerCase()]) missing.push(`${method} ${path}`);
    }
    expect(missing).toEqual([]);
  });
});

describe("docs endpoints", () => {
  const app = createApp();

  it("serves the raw spec at /api/openapi.json", async () => {
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\.0/);
    expect(res.body.paths["/api/health"]).toBeDefined();
  });

  it("serves Swagger UI HTML at /api/docs/", async () => {
    const res = await request(app).get("/api/docs/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text.toLowerCase()).toContain("swagger");
  });
});

describe("Bearer token auth", () => {
  const app = createApp();
  let prisma: ReturnType<typeof installMockPrisma>;
  beforeEach(() => {
    prisma = installMockPrisma();
  });
  afterEach(resetPrisma);

  it("authenticates via Authorization: Bearer <jwt> with no cookie", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", name: "A", memberships: [] } as never);
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${signSession("u1")}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("u1");
  });

  it("rejects a malformed bearer token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("login returns a usable bearer token", async () => {
    const argon2 = (await import("argon2")).default;
    const hash = await argon2.hash("longenough");
    prisma.user.findUnique.mockResolvedValue({ id: "u9", email: "a@b.com", name: null, passwordHash: hash } as never);
    const login = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "longenough" });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe("string");

    // The returned token works as a Bearer credential on a fresh request (no cookie).
    prisma.user.findUnique.mockResolvedValue({ id: "u9", email: "a@b.com", name: null, memberships: [] } as never);
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe("u9");
  });
});
