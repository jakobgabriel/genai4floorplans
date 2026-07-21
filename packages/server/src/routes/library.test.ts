import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.ts";
import { installMockPrisma, resetPrisma } from "../test/mockPrisma.ts";
import { sessionCookie } from "../test/helpers.ts";

const app = createApp();
let prisma: ReturnType<typeof installMockPrisma>;

beforeEach(() => { prisma = installMockPrisma(); });
afterEach(resetPrisma);

const editor = () => prisma.membership.findUnique.mockResolvedValue({ role: "EDITOR" } as never);
const viewer = () => prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);

describe("GET /api/teams/:teamId/library", () => {
  it("returns the global catalog + team customs to a VIEWER", async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);
    viewer();
    prisma.libraryEntry.findMany.mockResolvedValue([
      { id: "g1", teamId: null, entry: { name: "CNC" } },
      { id: "c1", teamId: "t1", entry: { name: "Custom", custom: true } },
    ] as never);
    const res = await request(app).get("/api/teams/t1/library").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    // Query pulls global (teamId null) OR this team's entries.
    expect(prisma.libraryEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ teamId: null }, { teamId: "t1" }] } }));
  });
});

describe("POST /api/teams/:teamId/library", () => {
  it("403s for a VIEWER", async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);
    const res = await request(app).post("/api/teams/t1/library").set("Cookie", sessionCookie("u1")).send({ entry: { name: "X" } });
    expect(res.status).toBe(403);
  });

  it("creates a team custom entry", async () => {
    editor();
    prisma.libraryEntry.create.mockResolvedValue({ id: "c9", teamId: "t1", entry: { name: "X" } } as never);
    const res = await request(app).post("/api/teams/t1/library").set("Cookie", sessionCookie("u1")).send({ entry: { name: "X" } });
    expect(res.status).toBe(201);
    expect(res.body.entry.teamId).toBe("t1");
  });
});

describe("PATCH/DELETE /api/teams/:teamId/library/:entryId", () => {
  it("404s when the entry isn't a custom of this team (global is read-only)", async () => {
    editor();
    prisma.libraryEntry.findFirst.mockResolvedValue(null);
    const res = await request(app).patch("/api/teams/t1/library/g1").set("Cookie", sessionCookie("u1")).send({ entry: { name: "Z" } });
    expect(res.status).toBe(404);
  });

  it("deletes a team custom entry", async () => {
    editor();
    prisma.libraryEntry.findFirst.mockResolvedValue({ id: "c1" } as never);
    prisma.libraryEntry.delete.mockResolvedValue({ id: "c1" } as never);
    const res = await request(app).delete("/api/teams/t1/library/c1").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(204);
    expect(prisma.libraryEntry.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});
