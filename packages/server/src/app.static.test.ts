import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "./app.ts";
import { ENV } from "./lib/env.ts";

// Locks the single-origin deploy behavior: when WEB_DIST points at a built SPA,
// the server serves it and falls back to index.html for client routes, while
// /api/* still behaves as a JSON API.
describe("static SPA serving (WEB_DIST set)", () => {
  let dir: string;
  const prev = ENV.webDist;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "flowplan-dist-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>FlowPlan SPA</title>");
    writeFileSync(join(dir, "app.js"), "console.log('spa');");
    ENV.webDist = dir;
  });
  afterAll(() => {
    ENV.webDist = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves the SPA index at the root", async () => {
    const res = await request(createApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("FlowPlan SPA");
  });

  it("serves real static assets", async () => {
    const res = await request(createApp()).get("/app.js");
    expect(res.status).toBe(200);
    expect(res.text).toContain("spa");
  });

  it("falls back to index.html for client routes", async () => {
    const res = await request(createApp()).get("/teams/abc/workspace");
    expect(res.status).toBe(200);
    expect(res.text).toContain("FlowPlan SPA");
  });

  it("keeps /api as a JSON API (health + JSON 404), never the SPA", async () => {
    const app = createApp();
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });

    // Unknown /api paths still flow through the API stack (here: requireAuth →
    // JSON 401), never the SPA fallback — the fallback regex excludes /api/.
    const unknown = await request(app).get("/api/nope");
    expect(unknown.status).toBe(401);
    expect(unknown.headers["content-type"]).toContain("application/json");
    expect(unknown.text).not.toContain("FlowPlan SPA");
  });
});

describe("API-only mode (WEB_DIST unset)", () => {
  it("does not serve a SPA — non-/api GET is a plain 404", async () => {
    const res = await request(createApp()).get("/some/client/route");
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("FlowPlan SPA");
  });
});
