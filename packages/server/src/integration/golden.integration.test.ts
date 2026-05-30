import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { SAMPLE } from "@flowplan/core/model/sample";
import { createApp } from "../app.ts";
import { setPrisma } from "../lib/prisma.ts";

// Golden-path integration test against a REAL Postgres. Opt-in only:
//   docker compose up -d
//   DATABASE_URL=... npm run test:integration   (sets RUN_DB_TESTS=1)
// It is skipped in the default `npm test` so the suite never needs a database.
const RUN = process.env.RUN_DB_TESTS === "1";
const d = RUN ? describe : describe.skip;

d("golden path: register → team → workspace → cell → scenario", () => {
  let prisma: PrismaClient;
  const app = createApp();
  const agent = request.agent(app);
  const email = `it_${Date.now()}@example.com`;

  beforeAll(() => {
    prisma = new PrismaClient();
    setPrisma(prisma);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    setPrisma(null);
  });

  it("runs end to end", async () => {
    await agent.post("/api/auth/register").send({ email, password: "longenough" }).expect(201);
    const team = (await agent.post("/api/teams").send({ name: "IT Team" }).expect(201)).body.team;
    const ws = (await agent.post(`/api/teams/${team.id}/workspaces`).send({ name: "WS" }).expect(201)).body.workspace;

    const hydrate = (await agent.get(`/api/workspaces/${ws.id}`).expect(200)).body.workspace;
    expect(hydrate.cells.length).toBe(1);

    const cellId = hydrate.cells[0].id;
    const put = (await agent.put(`/api/cells/${cellId}`).send({ model: SAMPLE }).expect(200)).body;
    expect(put.rating.letter).toBeTruthy();

    await agent.put(`/api/workspaces/${ws.id}/scenarios/Baseline`).send({ model: SAMPLE }).expect(200);
    const list = (await agent.get(`/api/workspaces/${ws.id}/scenarios`).expect(200)).body.scenarios;
    expect(list.some((s: { name: string }) => s.name === "Baseline")).toBe(true);

    await agent.delete(`/api/teams/${team.id}`).expect(204);
  });
});
