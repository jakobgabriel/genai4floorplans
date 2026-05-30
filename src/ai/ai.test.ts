import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { buildRating } from "../engine/rating";
import { validateFlow } from "../engine/validate";
import { chainRating } from "../engine/automation";
import { strategist } from "./strategist";
import { createClaudeProvider, type FetchLike } from "./llm/claude";
import { getProvider } from "./provider";
import { DEFAULT_SETTINGS } from "../store/settings";
import type { ProposalContext } from "./types";

function ctxFor(model = SAMPLE): ProposalContext {
  return {
    model,
    rating: buildRating(model),
    validation: validateFlow(model.stations, model.flows),
    chain: chainRating(model.stations, model.flows),
  };
}

describe("strategist.propose", () => {
  it("returns engine-scored, valid proposals", async () => {
    const ctx = ctxFor();
    const proposals = await strategist.propose(ctx);
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of proposals) {
      // never a layout with new blocking flow errors
      expect(validateFlow(p.model.stations, p.model.flows).valid).toBe(true);
      // the displayed rating is exactly the engine's rating of the candidate
      expect(p.after.composite).toBeCloseTo(buildRating(p.model).composite, 6);
      // delta is consistent with before/after
      expect(p.deltas.composite).toBeCloseTo(p.after.composite - ctx.rating.composite, 6);
    }
  });

  it("offers a parallel-lane proposal that raises line output", async () => {
    const ctx = ctxFor();
    const proposals = await strategist.propose(ctx);
    const bn = proposals.find((p) => p.strategy === "parallel-lane");
    expect(bn).toBeTruthy();
    // An extra parallel lane at the constraint lifts throughput (parts/shift).
    expect(bn!.after.balance.lineOut).toBeGreaterThan(ctx.rating.balance.lineOut);
  });
});

describe("strategist.narrate", () => {
  it("mentions the grade and is non-trivial", async () => {
    const text = await strategist.narrate(ctxFor());
    expect(text).toContain(buildRating(SAMPLE).letter);
    expect(text.length).toBeGreaterThan(40);
  });
});

describe("strategist.edit", () => {
  it("parses 'make the line a U'", async () => {
    const r = await strategist.edit(ctxFor(), "make the line a U");
    expect(r.actions).toEqual([{ type: "APPLY_TEMPLATE", form: "U" }]);
  });

  it("parses 'move QA next to Assembly'", async () => {
    const r = await strategist.edit(ctxFor(), "move QA next to Assembly");
    expect(r.actions[0]).toMatchObject({ type: "MOVE_STATION", id: "qa" });
  });

  it("parses 'connect QA to CNC'", async () => {
    const r = await strategist.edit(ctxFor(), "connect QA to CNC");
    expect(r.actions[0]).toMatchObject({ type: "ADD_FLOW", from: "qa", to: "cnc" });
  });

  it("reports unresolved for gibberish", async () => {
    const r = await strategist.edit(ctxFor(), "do a barrel roll");
    expect(r.actions).toHaveLength(0);
    expect(r.unresolved).toBeTruthy();
  });
});

describe("strategist.ingest", () => {
  it("builds a valid model from CSV", async () => {
    const csv = "name, cycle, operators, capacity, to\nRaw, 0, 0, 2000, CNC\nCNC, 42, 1, 1300, Press\nPress, 38, 1, 1250, Ship\nShip, 0, 1, 2000,";
    const model = await strategist.ingest(csv);
    expect(model.stations.length).toBe(4);
    expect(model.flows.length).toBeGreaterThanOrEqual(2);
    expect(model.stations[0].role).toBe("input");
    expect(model.stations[model.stations.length - 1].role).toBe("output");
  });
});

describe("Claude adapter (mocked) — engine re-scores AI output", () => {
  it("ignores AI-supplied numbers and uses the engine's rating", async () => {
    // AI returns a candidate that moves CNC, plus a bogus composite the app must ignore.
    const candidate = { ...SAMPLE, stations: SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, x: 6, y: 6 } : s)) };
    const fakeFetch: FetchLike = (async () =>
      ({
        ok: true,
        async json() {
          return { content: [{ type: "text", text: JSON.stringify([{ title: "AI move", rationale: "x", composite: 999, model: candidate }]) }] };
        },
        async text() {
          return "";
        },
      }) as unknown as Response) as unknown as FetchLike;

    const provider = createClaudeProvider({ apiKey: "k", model: "claude-sonnet-4-6" }, fakeFetch);
    const proposals = await provider.propose(ctxFor());
    expect(proposals.length).toBe(1);
    // composite is the engine's, never 999
    expect(proposals[0].after.composite).toBeCloseTo(buildRating(candidate).composite, 6);
    expect(proposals[0].after.composite).not.toBe(999);
    expect(proposals[0].source).toBe("llm");
  });
});

describe("strategist.design", () => {
  it("builds a valid model from a prose brief with parallel lanes", async () => {
    const model = await strategist.design("Raw -> CNC x2 -> Press -> QA -> Ship");
    expect(model.stations).toHaveLength(5);
    expect(model.stations[0].role).toBe("input");
    expect(model.stations[model.stations.length - 1].role).toBe("output");
    expect(model.stations.some((s) => (s.parallelUnits ?? 1) === 2)).toBe(true);
    expect(validateFlow(model.stations, model.flows).valid).toBe(true);
  });
});

describe("strategist.optimizeGoal", () => {
  it("raises throughput with parallel lanes and reports a step plan", async () => {
    const res = await strategist.optimizeGoal(ctxFor(), {
      objective: "throughput",
      constraints: { allowMoves: true, allowParallel: true },
    });
    expect(res.steps.length).toBeGreaterThan(0);
    expect(res.proposal).toBeTruthy();
    expect(res.proposal!.after.balance.lineOut).toBeGreaterThan(buildRating(SAMPLE).balance.lineOut);
  });

  it("leaves a locked bottleneck untouched (no improvement found)", async () => {
    const res = await strategist.optimizeGoal(ctxFor(), {
      objective: "throughput",
      constraints: { allowMoves: true, allowParallel: true, lockedStationIds: ["cnc"] },
    });
    // CNC is the constraint; locking it means throughput can't be lifted by a lane.
    const cnc = (res.proposal?.model ?? SAMPLE).stations.find((s) => s.id === "cnc")!;
    expect(cnc.parallelUnits ?? 1).toBe(1);
  });

  it("respects a zero capex budget (can't buy a lane)", async () => {
    const stations = SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, capex: 50000 } : s));
    const res = await strategist.optimizeGoal(
      { ...ctxFor({ ...SAMPLE, stations }) },
      { objective: "throughput", constraints: { allowMoves: true, allowParallel: true, capexBudget: 0 } },
    );
    const cnc = (res.proposal?.model ?? SAMPLE).stations.find((s) => s.id === "cnc")!;
    expect(cnc.parallelUnits ?? 1).toBe(1);
  });
});

describe("Claude adapter design + vision (mocked)", () => {
  function fetchReturning(model: unknown): FetchLike {
    return (async () =>
      ({
        ok: true,
        async json() {
          return { content: [{ type: "text", text: JSON.stringify(model) }] };
        },
        async text() {
          return "";
        },
      }) as unknown as Response) as unknown as FetchLike;
  }

  it("design parses the model JSON the LLM returns", async () => {
    const provider = createClaudeProvider({ apiKey: "k", model: "claude-sonnet-4-6" }, fetchReturning(SAMPLE));
    const model = await provider.design("anything");
    expect(model.stations.length).toBe(SAMPLE.stations.length);
  });

  it("ingestImage parses a model from a vision response", async () => {
    const provider = createClaudeProvider({ apiKey: "k", model: "claude-sonnet-4-6" }, fetchReturning(SAMPLE));
    const model = await provider.ingestImage({ data: "abc", mediaType: "image/png" });
    expect(model.stations.length).toBe(SAMPLE.stations.length);
  });
});

describe("getProvider", () => {
  it("uses the offline strategist without a key", () => {
    expect(getProvider(DEFAULT_SETTINGS).name).toBe(strategist.name);
  });
  it("uses Claude when configured", () => {
    const p = getProvider({ ...DEFAULT_SETTINGS, aiProvider: "claude", keys: { claude: "k", openai: "" } });
    expect(p.name).toContain("Claude");
  });
  it("uses OpenAI when configured", () => {
    const p = getProvider({ ...DEFAULT_SETTINGS, aiProvider: "openai", keys: { claude: "", openai: "k" } });
    expect(p.name).toContain("OpenAI");
  });
});
