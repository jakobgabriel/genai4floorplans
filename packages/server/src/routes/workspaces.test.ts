import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.ts";
import { installMockPrisma, resetPrisma } from "../test/mockPrisma.ts";
import { sessionCookie } from "../test/helpers.ts";

const app = createApp();
let prisma: ReturnType<typeof installMockPrisma>;

beforeEach(() => {
  prisma = installMockPrisma();
  // Pass the EDITOR gate: :wsId → team, caller is an EDITOR.
  prisma.workspace.findUnique.mockResolvedValue({ teamId: "t1" } as never);
  prisma.membership.findUnique.mockResolvedValue({ role: "EDITOR" } as never);
  // Run the interactive transaction against the same mock client.
  prisma.$transaction.mockImplementation(((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof prisma) => unknown)(prisma) : Promise.all(arg as unknown[])) as never);
});
afterEach(resetPrisma);

const emptyTree = { folders: [], concepts: [], cells: [], activeId: null };

describe("PUT /api/workspaces/:wsId/tree (optimistic concurrency)", () => {
  it("saves and returns the bumped version when baseVersion matches", async () => {
    prisma.workspace.updateMany.mockResolvedValue({ count: 1 } as never); // guard matched
    prisma.workspace.update.mockResolvedValue({ version: 6 } as never);
    const res = await request(app)
      .put("/api/workspaces/w1/tree")
      .set("Cookie", sessionCookie("u1"))
      .send({ ...emptyTree, baseVersion: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: 6 });
    expect(prisma.workspace.updateMany).toHaveBeenCalledWith({
      where: { id: "w1", version: 5 },
      data: { version: { increment: 1 } },
    });
  });

  it("409s and writes nothing when baseVersion is stale", async () => {
    prisma.workspace.updateMany.mockResolvedValue({ count: 0 } as never); // guard missed → conflict
    const res = await request(app)
      .put("/api/workspaces/w1/tree")
      .set("Cookie", sessionCookie("u1"))
      .send({ ...emptyTree, baseVersion: 3 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("conflict");
    // The write was rejected before touching the tree.
    expect(prisma.cell.deleteMany).not.toHaveBeenCalled();
    expect(prisma.workspace.update).not.toHaveBeenCalled();
  });

  it("saves without the guard (last-write-wins) when no baseVersion is sent", async () => {
    prisma.workspace.update.mockResolvedValue({ version: 0 } as never);
    const res = await request(app)
      .put("/api/workspaces/w1/tree")
      .set("Cookie", sessionCookie("u1"))
      .send(emptyTree);
    expect(res.status).toBe(200);
    expect(prisma.workspace.updateMany).not.toHaveBeenCalled();
  });
});
