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

describe("subflows routes", () => {
  it("lists a team's subflows", async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);
    prisma.subflow.findMany.mockResolvedValue([{ id: "s1", teamId: "t1", name: "A", data: { stations: [] } }] as never);
    const res = await request(app).get("/api/teams/t1/subflows").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(200);
    expect(res.body.subflows).toHaveLength(1);
  });

  it("creates a subflow (EDITOR)", async () => {
    editor();
    prisma.subflow.create.mockResolvedValue({ id: "s2", teamId: "t1", name: "Grp", data: { stations: [] } } as never);
    const res = await request(app).post("/api/teams/t1/subflows").set("Cookie", sessionCookie("u1")).send({ name: "Grp", data: { stations: [] } });
    expect(res.status).toBe(201);
    expect(res.body.subflow.name).toBe("Grp");
  });

  it("deletes a subflow scoped to the team", async () => {
    editor();
    prisma.subflow.findFirst.mockResolvedValue({ id: "s2" } as never);
    prisma.subflow.delete.mockResolvedValue({ id: "s2" } as never);
    const res = await request(app).delete("/api/teams/t1/subflows/s2").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(204);
  });
});
