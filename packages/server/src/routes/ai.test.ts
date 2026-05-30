import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { SAMPLE } from "@flowplan/core/model/sample";
import { buildRating } from "@flowplan/core/engine/rating";
import { createApp } from "../app.ts";
import { installMockPrisma, resetPrisma } from "../test/mockPrisma.ts";
import { sessionCookie } from "../test/helpers.ts";
import { ENV } from "../lib/env.ts";

const app = createApp();
let prisma: ReturnType<typeof installMockPrisma>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  prisma = installMockPrisma();
  // No team-stored credential; fall through to an env-level key (Claude).
  prisma.teamAiCredential.findMany.mockResolvedValue([] as never);
  prisma.aiUsageLog.create.mockResolvedValue({} as never);
  prisma.cell.findUnique.mockResolvedValue({ workspace: { teamId: "t1" } } as never);
  prisma.membership.findUnique.mockResolvedValue({ role: "EDITOR" } as never);
  ENV.anthropicKey = "env-test-key";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  ENV.anthropicKey = "";
  resetPrisma();
  vi.restoreAllMocks();
});

describe("POST /api/teams/:teamId/ai/propose", () => {
  it("re-scores the LLM's candidate with the engine (ignores AI-supplied numbers) and logs usage", async () => {
    // The (fake) LLM moves CNC and lies about the composite; the server must ignore it.
    const candidate = { ...SAMPLE, stations: SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, x: 6, y: 6 } : s)) };
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: true,
        async json() {
          return { content: [{ type: "text", text: JSON.stringify([{ title: "AI move", rationale: "x", composite: 999, model: candidate }]) }] };
        },
        async text() {
          return "";
        },
      }) as unknown as Response,
    ) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/teams/t1/ai/propose")
      .set("Cookie", sessionCookie("u1"))
      .send({ model: SAMPLE });

    expect(res.status).toBe(200);
    expect(res.body.proposals.length).toBe(1);
    // composite is the engine's, never the model's bogus 999
    expect(res.body.proposals[0].after.composite).toBeCloseTo(buildRating(candidate).composite, 6);
    expect(res.body.proposals[0].after.composite).not.toBe(999);
    // usage was logged
    expect(prisma.aiUsageLog.create).toHaveBeenCalledOnce();
  });

  it("403s for a VIEWER (propose is an EDITOR action)", async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);
    const res = await request(app).post("/api/teams/t1/ai/propose").set("Cookie", sessionCookie("u1")).send({ model: SAMPLE });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/teams/:teamId/ai/narrate", () => {
  it("falls back to the offline strategist when no provider key exists", async () => {
    ENV.anthropicKey = "";
    prisma.membership.findUnique.mockResolvedValue({ role: "VIEWER" } as never);
    const res = await request(app).post("/api/teams/t1/ai/narrate").set("Cookie", sessionCookie("u1")).send({ model: SAMPLE });
    expect(res.status).toBe(200);
    // strategist narration mentions the engine grade
    expect(res.body.narration).toContain(buildRating(SAMPLE).letter);
  });
});
