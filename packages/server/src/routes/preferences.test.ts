import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.ts";
import { installMockPrisma, resetPrisma } from "../test/mockPrisma.ts";
import { sessionCookie } from "../test/helpers.ts";

const app = createApp();
let prisma: ReturnType<typeof installMockPrisma>;

beforeEach(() => { prisma = installMockPrisma(); });
afterEach(resetPrisma);

describe("GET /api/me/preferences", () => {
  it("401s without a session", async () => {
    const res = await request(app).get("/api/me/preferences");
    expect(res.status).toBe(401);
  });

  it("returns an empty object when the user has none", async () => {
    prisma.userPreference.findUnique.mockResolvedValue(null as never);
    const res = await request(app).get("/api/me/preferences").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(200);
    expect(res.body.prefs).toEqual({});
  });

  it("returns the stored prefs blob", async () => {
    prisma.userPreference.findUnique.mockResolvedValue({ prefs: { theme: "white" } } as never);
    const res = await request(app).get("/api/me/preferences").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(200);
    expect(res.body.prefs).toEqual({ theme: "white" });
  });
});

describe("PUT /api/me/preferences", () => {
  it("400s on a non-object body", async () => {
    const res = await request(app).put("/api/me/preferences").set("Cookie", sessionCookie("u1")).send({ prefs: "nope" });
    expect(res.status).toBe(400);
  });

  it("upserts the caller's prefs and echoes them back", async () => {
    prisma.userPreference.upsert.mockResolvedValue({ prefs: { theme: "white", panels: { libW: 300 } } } as never);
    const res = await request(app)
      .put("/api/me/preferences")
      .set("Cookie", sessionCookie("u1"))
      .send({ prefs: { theme: "white", panels: { libW: 300 } } });
    expect(res.status).toBe(200);
    expect(res.body.prefs.theme).toBe("white");
    // Upsert is keyed by the authenticated user.
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
  });
});
