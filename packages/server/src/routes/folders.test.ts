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

describe("POST /api/workspaces/:wsId/folders", () => {
  it("403s for a VIEWER", async () => {
    // teamId resolves from the :wsId branch, then the VIEWER fails the EDITOR gate
    prisma.workspace.findUnique.mockResolvedValue({ teamId: "t1" } as never);
    prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);
    const res = await request(app)
      .post("/api/workspaces/w1/folders")
      .set("Cookie", sessionCookie("u1"))
      .send({ name: "Line 1" });
    expect(res.status).toBe(403);
  });

  it("creates a folder at sibling position = count", async () => {
    prisma.workspace.findUnique.mockResolvedValue({ teamId: "t1" } as never);
    editor();
    prisma.folder.count.mockResolvedValue(2);
    prisma.folder.create.mockResolvedValue({ id: "f3", name: "Line 1", parentId: null, position: 2 } as never);
    const res = await request(app)
      .post("/api/workspaces/w1/folders")
      .set("Cookie", sessionCookie("u1"))
      .send({ name: "Line 1" });
    expect(res.status).toBe(201);
    expect(res.body.folder).toEqual({ id: "f3", name: "Line 1", parentId: null, position: 2 });
    expect(prisma.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: "w1", parentId: null, position: 2 }) }),
    );
  });

  it("rejects a parent that isn't in the workspace", async () => {
    prisma.workspace.findUnique.mockResolvedValue({ teamId: "t1" } as never);
    editor();
    prisma.folder.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/workspaces/w1/folders")
      .set("Cookie", sessionCookie("u1"))
      .send({ name: "Sub", parentId: "fX" });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/folders/:folderId (move / cycle guard)", () => {
  beforeEach(() => {
    prisma.folder.findUnique.mockImplementation((args: any) => {
      // resolveTeamId asks for { workspace: { teamId } }; cycle walk asks for { parentId }
      if (args?.select?.workspace) return { workspace: { teamId: "t1" } } as never;
      return null as never;
    });
    editor();
  });

  it("rejects moving a folder into itself", async () => {
    const res = await request(app)
      .patch("/api/folders/f1")
      .set("Cookie", sessionCookie("u1"))
      .send({ parentId: "f1" });
    expect(res.status).toBe(400);
  });

  it("rejects moving a folder into its own descendant (cycle)", async () => {
    // team resolve returns workspace; cycle walk: f2 -> f1 (so moving f1 under f2 cycles)
    prisma.folder.findUnique.mockImplementation((args: any) => {
      if (args?.select?.workspace) return { workspace: { teamId: "t1" } } as never;
      if (args?.where?.id === "f2") return { parentId: "f1" } as never;
      return { parentId: null } as never;
    });
    const res = await request(app)
      .patch("/api/folders/f1")
      .set("Cookie", sessionCookie("u1"))
      .send({ parentId: "f2" });
    expect(res.status).toBe(400);
  });

  it("allows a valid rename", async () => {
    prisma.folder.update.mockResolvedValue({ id: "f1", name: "Renamed", parentId: null, position: 0 } as never);
    const res = await request(app)
      .patch("/api/folders/f1")
      .set("Cookie", sessionCookie("u1"))
      .send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.folder.name).toBe("Renamed");
  });
});

describe("DELETE /api/folders/:folderId (reparent, no data loss)", () => {
  it("reparents child folders, cells and scenarios to the parent, then deletes", async () => {
    prisma.folder.findUnique.mockImplementation((args: any) => {
      if (args?.select?.workspace) return { workspace: { teamId: "t1" } } as never;
      return { parentId: "fp" } as never; // f1's parent is fp
    });
    editor();
    prisma.$transaction.mockResolvedValue([] as never);

    const res = await request(app).delete("/api/folders/f1").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(204);
    expect(prisma.folder.updateMany).toHaveBeenCalledWith({ where: { parentId: "f1" }, data: { parentId: "fp" } });
    expect(prisma.cell.updateMany).toHaveBeenCalledWith({ where: { folderId: "f1" }, data: { folderId: "fp" } });
    expect(prisma.scenario.updateMany).toHaveBeenCalledWith({ where: { folderId: "f1" }, data: { folderId: "fp" } });
    expect(prisma.folder.delete).toHaveBeenCalledWith({ where: { id: "f1" } });
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
