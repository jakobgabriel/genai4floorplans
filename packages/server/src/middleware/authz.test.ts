import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { SAMPLE } from "@flowplan/core/model/sample";
import { createApp } from "../app.ts";
import { installMockPrisma, resetPrisma } from "../test/mockPrisma.ts";
import { sessionCookie } from "../test/helpers.ts";

const app = createApp();
let prisma: ReturnType<typeof installMockPrisma>;

beforeEach(() => {
  prisma = installMockPrisma();
});
afterEach(resetPrisma);

// requireTeamRole resolves a cell -> workspace -> team, then checks membership.
describe("requireTeamRole gating (PUT /api/cells/:cellId)", () => {
  function arrangeCell() {
    prisma.cell.findUnique.mockResolvedValue({ workspace: { teamId: "t1" } } as never);
  }

  it("401s without a session", async () => {
    const res = await request(app).put("/api/cells/c1").send({ model: SAMPLE });
    expect(res.status).toBe(401);
  });

  it("404s when the caller is not a member (no existence leak)", async () => {
    arrangeCell();
    prisma.membership.findUnique.mockResolvedValue(null);
    const res = await request(app).put("/api/cells/c1").set("Cookie", sessionCookie("u1")).send({ model: SAMPLE });
    expect(res.status).toBe(404);
  });

  it("403s for a VIEWER on an EDITOR route", async () => {
    arrangeCell();
    prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);
    const res = await request(app).put("/api/cells/c1").set("Cookie", sessionCookie("u1")).send({ model: SAMPLE });
    expect(res.status).toBe(403);
  });

  it("allows an EDITOR and returns an engine-computed rating", async () => {
    arrangeCell();
    prisma.membership.findUnique.mockResolvedValue({ role: "EDITOR" } as never);
    prisma.cell.update.mockResolvedValue({ id: "c1", name: "Cell", position: 0 } as never);
    const res = await request(app).put("/api/cells/c1").set("Cookie", sessionCookie("u1")).send({ model: SAMPLE });
    expect(res.status).toBe(200);
    // server re-runs buildRating; a letter grade proves the engine ran
    expect(res.body.rating.letter).toBeTruthy();
    expect(typeof res.body.rating.composite).toBe("number");
  });

  it("404s when the cell does not exist", async () => {
    prisma.cell.findUnique.mockResolvedValue(null);
    prisma.membership.findUnique.mockResolvedValue({ role: "EDITOR" } as never);
    const res = await request(app).put("/api/cells/missing").set("Cookie", sessionCookie("u1")).send({ model: SAMPLE });
    expect(res.status).toBe(404);
  });
});
