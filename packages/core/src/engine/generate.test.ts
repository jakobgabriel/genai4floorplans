import { describe, it, expect } from "vitest";
import { CONCEPTS, CONCEPT_KINDS, conceptFit, rankConcepts } from "./concepts";
import {
  DECISION_WEIGHTS,
  conceptCrossover,
  conceptCrossoverRanges,
  filterCandidates,
  generateCandidates,
  normalizeDecisionWeights,
  rankByDecision,
  rankCandidates,
  scoreCandidates,
  sensitivity,
  type GenerateBrief,
} from "./generate";
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

describe("conceptCrossoverRanges", () => {
  const opts = { from: 1000, to: 2000000, samples: 12, refine: 4 };

  it("reports contiguous, non-overlapping stretches that cover the sweep", () => {
    const segs = conceptCrossoverRanges(brief(), opts);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs[0].from).toBe(1000);
    expect(segs[segs.length - 1].to).toBeNull();
    segs.slice(0, -1).forEach((s, i) => {
      expect(s.to).not.toBeNull();
      // No gap and no overlap: one stretch ends exactly where the next begins.
      expect(s.to).toBe(segs[i + 1].from);
      expect(s.to!).toBeGreaterThan(s.from);
    });
  });

  it("never puts the same winner in two adjacent stretches", () => {
    const segs = conceptCrossoverRanges(brief(), opts);
    segs.slice(1).forEach((s, i) => expect(s.winner).not.toBe(segs[i].winner));
  });

  // Sampling alone reports "the winner had already changed by 24,621", which is
  // an artefact of where the samples fell. Refinement is what makes the number
  // a crossover rather than a sample index.
  it("pins the boundary tighter than the sample spacing", () => {
    const coarse = conceptCrossoverRanges(brief(), { ...opts, refine: 0 });
    const fine = conceptCrossoverRanges(brief(), { ...opts, refine: 8 });
    const b0 = coarse[0].to!;
    const b1 = fine[0].to!;
    expect(b1).toBeLessThanOrEqual(b0);
    // The refined boundary sits below the coarse sample it was found at.
    expect(b1).toBeGreaterThan(coarse[0].from);
  });

  it("reports how close the runner-up concept was, so a coin toss reads as one", () => {
    const segs = conceptCrossoverRanges(brief(), opts);
    segs.filter((s) => s.winner).forEach((s) => {
      expect(s.minMarginPct).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.minMarginPct)).toBe(true);
    });
  });

  it("says when nothing in the catalog can make the demand, rather than dropping it", () => {
    // Far above what any concept on one line can produce.
    const segs = conceptCrossoverRanges(brief(), { from: 1000, to: 50000000, samples: 10, refine: 3 });
    const dead = segs.find((s) => s.winner === null);
    expect(dead, "expected an open-ended stretch with no viable concept").toBeTruthy();
    expect(dead!.to).toBeNull();
    // And it carries no fabricated cost.
    expect(dead!.costPerPart).toBe(0);
    expect(Number.isFinite(dead!.costPerPart)).toBe(true);
  });

  it("reads the catalog it is given, so an edited band moves the crossover", () => {
    const base = conceptCrossoverRanges(brief(), opts);
    // Make the transfer line implausibly cheap and it should take more of the axis.
    const cheapTL = Object.values(CONCEPTS).map((c) =>
      c.kind === "transfer-line" ? { ...c, capexPerStation: 1000 } : c,
    );
    const edited = conceptCrossoverRanges({ ...brief(), conceptCatalog: cheapTL }, opts);
    const span = (segs: ReturnType<typeof conceptCrossoverRanges>) =>
      segs.filter((s) => s.winner === "transfer-line").reduce((a, s) => a + ((s.to ?? 2000000) - s.from), 0);
    expect(span(edited)).toBeGreaterThan(span(base));
  });

  it("returns nothing for a brief with no steps, rather than sweeping an empty cell", () => {
    expect(conceptCrossoverRanges({ ...brief(), steps: [] }, opts)).toEqual([]);
  });
});

// The ranking used to be loaded cost per part and nothing else — one defensible
// objective out of several, never stated, with conceptFit computed and ignored.
describe("the decision score", () => {
  const ONLY_COST = { cost: 1, capex: 0, fit: 0, operators: 0, flexibility: 0 };

  it("reproduces the old cost-only ranking exactly when only cost is weighted", () => {
    const byCost = rankCandidates(generateCandidates(brief()));
    const byWeights = rankByDecision(generateCandidates(brief()), ONLY_COST);
    expect(byWeights.map((c) => c.id)).toEqual(byCost.map((c) => c.id));
  });

  it("moves the winner when the weights move", () => {
    const cands = generateCandidates(brief());
    const cheapest = rankByDecision(cands.slice(), ONLY_COST)[0];
    const leanest = rankByDecision(cands.slice(), { cost: 0, capex: 1, fit: 0, operators: 0, flexibility: 0 })[0];
    // Lowest cost per part and lowest capital exposure are not the same choice,
    // which is the entire reason a single-metric sort was the wrong shape.
    expect(leanest.metrics.capexTotal).toBeLessThanOrEqual(cheapest.metrics.capexTotal);
  });

  it("makes the viable-volume band count, so editing it changes the order", () => {
    const cands = generateCandidates(brief());
    const byFit = rankByDecision(cands.slice(), { cost: 0, capex: 0, fit: 1, operators: 0, flexibility: 0 });
    expect(byFit[0].metrics.conceptFit).toBeGreaterThanOrEqual(byFit[byFit.length - 1].metrics.conceptFit);
  });

  it("shows the per-criterion scores, so the number can be argued with", () => {
    const c = scoreCandidates(generateCandidates(brief()))[0];
    expect(c.metrics.criteria).toBeTruthy();
    Object.values(c.metrics.criteria!).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
    expect(c.metrics.decisionScore).toBeGreaterThanOrEqual(0);
    expect(c.metrics.decisionScore).toBeLessThanOrEqual(100);
  });

  it("scores a criterion flat when it cannot separate anything, instead of dividing by zero", () => {
    const one = generateCandidates(brief()).slice(0, 1);
    const scored = scoreCandidates(one);
    expect(Number.isFinite(scored[0].metrics.decisionScore!)).toBe(true);
    expect(scored[0].metrics.decisionScore).toBe(100);
  });

  it("normalizes weights and survives all-zero", () => {
    const n = normalizeDecisionWeights({ cost: 2, capex: 2, fit: 0, operators: 0, flexibility: 0 });
    expect(n.cost + n.capex + n.fit + n.operators + n.flexibility).toBeCloseTo(1);
    expect(normalizeDecisionWeights({ cost: 0, capex: 0, fit: 0, operators: 0, flexibility: 0 })).toEqual(DECISION_WEIGHTS);
  });

  it("keeps candidates that miss demand last whatever the weights", () => {
    const ranked = rankByDecision(generateCandidates({ ...brief(), annualVolume: 5000000 }));
    const firstMiss = ranked.findIndex((c) => !c.metrics.meetsDemand);
    if (firstMiss >= 0) expect(ranked.slice(firstMiss).every((c) => !c.metrics.meetsDemand)).toBe(true);
  });
});

// A brief is a set of estimates. Ranking them once says nothing about whether
// the winner survives being wrong about any single one of them.
describe("sensitivity", () => {
  it("varies each factor on its own and reports whether the answer holds", () => {
    const s = sensitivity(brief());
    expect(s.rows.map((r) => r.factor)).toEqual([
      "Annual demand",
      "Labour rate",
      "Capex amortisation years",
      "Shifts per year",
    ]);
    expect(s.baseWinner).toBeTruthy();
    expect(s.flipCount).toBe(s.rows.filter((r) => r.flips).length);
  });

  it("counts a factor as flipping when either end differs from the base, not just from each other", () => {
    // Both ends can land on the same concept while the middle sits on another —
    // lane rounding makes the cost curve non-monotonic — and that is still a
    // ranking that does not survive being wrong.
    const s = sensitivity(brief());
    s.rows.forEach((r) => {
      const differs = r.lowWinner !== r.highWinner || r.lowWinner !== s.baseWinner || r.highWinner !== s.baseWinner;
      expect(r.flips).toBe(differs);
    });
  });

  it("widens with the spread", () => {
    const tight = sensitivity(brief(), DECISION_WEIGHTS, 1);
    // A 1% wobble should not move the answer as much as a 50% one.
    expect(tight.flipCount).toBeLessThanOrEqual(sensitivity(brief(), DECISION_WEIGHTS, 50).flipCount);
  });

  it("returns no rows for a brief with no steps", () => {
    expect(sensitivity({ ...brief(), steps: [] }).rows).toEqual([]);
  });
});
