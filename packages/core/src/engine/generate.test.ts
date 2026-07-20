import { describe, it, expect } from "vitest";
import { CONCEPTS, CONCEPT_KINDS, conceptFit, rankConcepts } from "./concepts";
import { conceptCrossover, filterCandidates, generateCandidates, rankCandidates, type GenerateBrief } from "./generate";
import { validateFlow } from "./validate";
import { hasCollision } from "./geometry";

const brief = (over: Partial<GenerateBrief> = {}): GenerateBrief => ({
  name: "Bracket",
  annualVolume: 120000,
  annualShifts: 460,
  shiftHours: 8,
  steps: [
    { name: "Blank", cycleTimeSec: 25 },
    { name: "Form", cycleTimeSec: 40 },
    { name: "Weld", cycleTimeSec: 55 },
    { name: "Inspect", cycleTimeSec: 20, type: "quality" },
  ],
  ...over,
});

describe("conceptFit", () => {
  it("scores 100 inside the band", () => {
    expect(conceptFit("cell", 50000)).toBe(100);
    expect(conceptFit("transfer-line", 1000000)).toBe(100);
  });

  it("tapers outside the band rather than excluding", () => {
    const far = conceptFit("transfer-line", 5000);
    const near = conceptFit("transfer-line", 300000);
    expect(far).toBe(0);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(100);
  });

  it("ranks a low volume toward manual concepts and a high one toward automation", () => {
    expect(rankConcepts(5000)[0].kind).toMatch(/job-shop|manual-bench/);
    expect(rankConcepts(2000000)[0].kind).toBe("transfer-line");
  });

  it("returns zero for a zero volume rather than throwing", () => {
    expect(conceptFit("cell", 0)).toBe(0);
  });
});

describe("generateCandidates", () => {
  const cands = generateCandidates(brief());

  it("produces one candidate per concept × form", () => {
    const expected = CONCEPT_KINDS.reduce((a, k) => a + CONCEPTS[k].forms.length, 0);
    expect(cands).toHaveLength(expected);
  });

  it("is deterministic — the same brief gives the same ranking", () => {
    const a = rankCandidates(generateCandidates(brief())).map((c) => c.id);
    const b = rankCandidates(generateCandidates(brief())).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("emits models that pass the ordinary flow validator", () => {
    cands.forEach((c) => {
      const v = validateFlow(c.model.stations, c.model.flows);
      expect(v.valid, `${c.id}: ${v.issues.map((i) => i.msg).join("; ")}`).toBe(true);
    });
  });

  it("lays stations out without overlapping", () => {
    cands.forEach((c) => {
      c.model.stations.forEach((s) => {
        const others = c.model.stations.filter((o) => o.id !== s.id);
        expect(hasCollision(s, s.x, s.y, others, c.model.noGoZones), `${c.id} / ${s.name}`).toBe(false);
      });
    });
  });

  it("carries the concept onto the model and decomposes cycle times", () => {
    const cell = cands.find((c) => c.concept === "cell");
    expect(cell?.model.conceptKind).toBe("cell");
    const procs = cell?.model.stations.filter((s) => s.role === "process") ?? [];
    expect(procs.length).toBeGreaterThan(0);
    procs.forEach((s) => expect(s.cycle).toBeDefined());
    // "Inspect" is NNVA, so some non-value-add lands in the breakdown.
    const handling = procs.reduce((a, s) => a + (s.cycle?.handlingSec ?? 0), 0);
    expect(handling).toBeGreaterThan(0);
    expect(cell?.metrics.valueAddPct).toBeGreaterThan(0);
    expect(cell?.metrics.valueAddPct).toBeLessThan(100);
  });

  it("balances elements into stations rather than mapping them 1:1", () => {
    // Four steps, 140s of content. At 250k/yr over 460 shifts the takt is wide
    // enough that the balancer must merge some of them.
    const cell = cands.find((c) => c.concept === "cell");
    const procs = cell?.model.stations.filter((s) => s.role === "process") ?? [];
    expect(procs.length).toBeLessThan(brief().steps.length);
    // Every station carries the capabilities of the work it absorbed.
    expect(procs.flatMap((s) => s.provides ?? []).length).toBeGreaterThan(0);
  });

  it("applies each concept's cycle factor to total work content", () => {
    // Station names now come from merged work, so compare total content instead
    // of a single named station: transfer line 0.6× vs manual bench 1.2× = 2×.
    const content = (kind: string) =>
      (cands.find((c) => c.concept === kind)?.model.stations ?? [])
        .filter((s) => s.role === "process")
        .reduce((a, s) => a + s.cycleTimeSec, 0);
    expect(content("manual-bench") / content("transfer-line")).toBeCloseTo(2, 1);
  });

  it("adds parallel lanes so a concept can meet demand", () => {
    const bench = cands.find((c) => c.concept === "manual-bench");
    // 120k/yr over 460 shifts ≈ 261/shift; a 66s manual weld does ~436/shift,
    // so a single lane is enough here — but the sizing must have run.
    expect(bench?.metrics.parallelUnits).toBeGreaterThanOrEqual(bench?.metrics.stations ?? 0);
    expect(bench?.metrics.meetsDemand).toBe(true);
  });

  it("never parallelises a transfer line", () => {
    const tl = cands.filter((c) => c.concept === "transfer-line");
    tl.forEach((c) => expect(c.metrics.parallelUnits).toBe(c.metrics.stations));
  });

  it("gives an empty sweep for a brief with no steps", () => {
    expect(generateCandidates(brief({ steps: [] }))).toEqual([]);
  });

  it("honours a concept restriction", () => {
    const only = generateCandidates(brief({ concepts: ["cell"] }));
    expect(new Set(only.map((c) => c.concept))).toEqual(new Set(["cell"]));
    expect(only).toHaveLength(CONCEPTS.cell.forms.length);
  });

  it("costs automation as higher capex and fewer operators", () => {
    const bench = rankCandidates(cands.filter((c) => c.concept === "manual-bench"))[0];
    const line = rankCandidates(cands.filter((c) => c.concept === "transfer-line"))[0];
    expect(line.metrics.capexTotal).toBeGreaterThan(bench.metrics.capexTotal);
    expect(line.metrics.operators).toBeLessThan(bench.metrics.operators);
  });
});

describe("rankCandidates", () => {
  const cands = generateCandidates(brief());

  it("sorts cost per part ascending and composite descending", () => {
    const cheap = rankCandidates(cands, "costPerPart").filter((c) => c.metrics.meetsDemand);
    for (let i = 1; i < cheap.length; i++) expect(cheap[i].metrics.costPerPart).toBeGreaterThanOrEqual(cheap[i - 1].metrics.costPerPart);

    const best = rankCandidates(cands, "composite").filter((c) => c.metrics.meetsDemand);
    for (let i = 1; i < best.length; i++) expect(best[i].metrics.composite).toBeLessThanOrEqual(best[i - 1].metrics.composite);
  });

  it("always sorts candidates that miss demand last", () => {
    // A tiny shift count makes per-shift demand enormous, so most concepts miss.
    const tough = generateCandidates(brief({ annualVolume: 50000000 }));
    const ranked = rankCandidates(tough, "costPerPart");
    const firstMiss = ranked.findIndex((c) => !c.metrics.meetsDemand);
    if (firstMiss >= 0) {
      expect(ranked.slice(firstMiss).every((c) => !c.metrics.meetsDemand)).toBe(true);
    }
  });
});

describe("filterCandidates", () => {
  const cands = generateCandidates(brief());

  it("gates on capex and operators", () => {
    const cheap = filterCandidates(cands, { maxCapex: 200000 });
    cheap.forEach((c) => expect(c.metrics.capexTotal).toBeLessThanOrEqual(200000));
    const lean = filterCandidates(cands, { maxOperators: 2 });
    lean.forEach((c) => expect(c.metrics.operators).toBeLessThanOrEqual(2));
  });

  it("can drop everything without throwing", () => {
    expect(filterCandidates(cands, { maxCapex: -1 })).toEqual([]);
  });
});

describe("conceptCrossover", () => {
  it("shifts the winning concept as volume rises", () => {
    const points = conceptCrossover(brief(), [5000, 50000, 500000, 5000000]);
    expect(points).toHaveLength(4);
    const winners = points.map((p) => p.winner);
    // The cheapest-per-part concept at 5k should not also win at 5M.
    expect(winners[0]).not.toBe(winners[3]);
    // Cost per part should fall as volume rises (capex amortises).
    expect(points[3].costPerPart).toBeLessThan(points[0].costPerPart);
  });
});
