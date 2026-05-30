import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { createApp } from "../app.ts";
import { installMockPrisma, resetPrisma } from "../test/mockPrisma.ts";
import { sessionCookie } from "../test/helpers.ts";

const app = createApp();
let prisma: ReturnType<typeof installMockPrisma>;

beforeEach(() => {
  prisma = installMockPrisma();
});
afterEach(resetPrisma);

describe("POST /api/auth/register", () => {
  it("rejects a short password", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@b.com", password: "short" });
    expect(res.status).toBe(400);
  });

  it("409s when the email already exists", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1" } as never);
    const res = await request(app).post("/api/auth/register").send({ email: "a@b.com", password: "longenough" });
    expect(res.status).toBe(409);
  });

  it("creates a user and sets a session cookie", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u1", email: "a@b.com", name: null } as never);
    const res = await request(app).post("/api/auth/register").send({ email: "a@b.com", password: "longenough" });
    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe("u1");
    expect(res.headers["set-cookie"][0]).toContain("flowplan_session=");
  });
});

describe("POST /api/auth/login", () => {
  it("401s on a bad password", async () => {
    const hash = await argon2.hash("correct-horse");
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", name: null, passwordHash: hash } as never);
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("succeeds and sets a cookie on the right password", async () => {
    const hash = await argon2.hash("correct-horse");
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", name: null, passwordHash: hash } as never);
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "correct-horse" });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"][0]).toContain("flowplan_session=");
  });
});

describe("GET /api/auth/me", () => {
  it("401s without a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the user + memberships with a valid session", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      memberships: [{ teamId: "t1", role: "OWNER", team: { name: "Acme" } }],
    } as never);
    const res = await request(app).get("/api/auth/me").set("Cookie", sessionCookie("u1"));
    expect(res.status).toBe(200);
    expect(res.body.memberships).toEqual([{ teamId: "t1", role: "OWNER", teamName: "Acme" }]);
  });
});
