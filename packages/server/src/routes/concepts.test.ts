import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.ts";
import { installMockPrisma, resetPrisma } from "../test/mockPrisma.ts";
import { sessionCookie } from "../test/helpers.ts";

const app = createApp();
let prisma: ReturnType<typeof installMockPrisma>;

beforeEach(() => {
  prisma = installMockPrisma();
});
afterEach(resetPrisma);

const editor = () => prisma.membership.findUnique.mockResolvedValue({ role: "EDITOR" } as never);

describe("POST /api/workspaces/:wsId/concepts", () => {
  it("403s for a VIEWER", async () => {
    prisma.workspace.findUnique.mockResolvedValue({ teamId: "t1" } as never);
    prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);
    const res = await request(app)
      .post("/api/workspaces/w1/concepts")
      .set("Cookie", sessionCookie("u1"))
      .send({ name: "Concept A" });
    expect(res.status).toBe(403);
  });

  it("creates a concept at sibling position = count", async () => {
    prisma.workspace.findUnique.mockResolvedValue({ teamId: "t1" } as never);
    editor();
    prisma.concept.count.mockResolvedValue(1);
    prisma.concept.create.mockResolvedValue({ id: "k2", name: "Concept A", folderId: null, position: 1 } as never);
    const res = await request(app)
      .post("/api/workspaces/w1/concepts")
      .set("Cookie", sessionCookie("u1"))
      .send({ name: "Concept A" });
    expect(res.status).toBe(201);
    expect(res.body.concept).toEqual({ id: "k2", name: "Concept A", folderId: null, position: 1 });
  });

  it("rejects a folder that isn't in the workspace", async () => {
    prisma.workspace.findUnique.mockResolvedValue({ teamId: "t1" } as never);
    editor();
    prisma.folder.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/workspaces/w1/concepts")
      .set("Cookie", sessionCookie("u1"))
      .send({ name: "C", folderId: "fX" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/concepts/:conceptId (rename / move)", () => {
  beforeEach(() => {
    prisma.concept.findUnique.mockResolvedValue({ workspace: { teamId: "t1" } } as never);
    editor();
  });

  it("renames a concept", async () => {
    prisma.concept.update.mockResolvedValue({ id: "k1", name: "Renamed", folderId: null, position: 0 } as never);
    const res = await request(app)
      .patch("/api/concepts/k1")
      .set("Cookie", sessionCookie("u1"))
      .send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.concept.name).toBe("Renamed");
  });

  it("moving a concept moves its layouts into the new folder", async () => {
    prisma.concept.update.mockResolvedValue({ id: "k1", name: "C", folderId: "f2", position: 0 } as never);
    const res = await request(app)
      .patch("/api/concepts/k1")
      .set("Cookie", sessionCookie("u1"))
      .send({ folderId: "f2" });
    expect(res.status).toBe(200);
    expect(prisma.cell.updateMany).toHaveBeenCalledWith({ where: { conceptId: "k1" }, data: { folderId: "f2" } });
  });
});

describe("DELETE /api/concepts/:conceptId (cascade to layouts)", () => {
  it("deletes the concept (its cells cascade via the FK)", async () => {
    prisma.concept.findUnique.mockImplementation((args: any) => {
      if (args?.select?.workspace) return { workspace: { teamId: "t1" } } as never;
      return { id: "k1" } as never;
    });
    editor();
    prisma.concept.delete.mockResolvedValue({ id: "k1" } as never);
    const res = await request(app).delete("/api/concepts/k1").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(204);
    expect(prisma.concept.delete).toHaveBeenCalledWith({ where: { id: "k1" } });
  });
});
