import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { computeKPIs } from "./kpis";
import { buildRating } from "./rating";
import { balanceAnalysis, stationRate } from "./balance";
import { validateFlow } from "./validate";
import { chainRating, autoCoherenceScore, ergoScore, autoPotential } from "./automation";
import { optimize } from "./optimize";
import { hasCollision } from "./geometry";

const grid = { gridW: SAMPLE.gridW, gridH: SAMPLE.gridH, noGoZones: SAMPLE.noGoZones };

// Golden-fixture tests: lock the demo's numbers so refactors can't silently
// change ratings. Snapshots are filled by `vitest -u` and then committed.
describe("KPIs (SAMPLE)", () => {
  it("computes flow cost / travel / congestion", () => {
    const k = computeKPIs(SAMPLE.stations, SAMPLE.flows, grid);
    expect({
      flowCost: +k.flowCost.toFixed(3),
      travel: +k.travel.toFixed(3),
      congestion: +k.congestion.toFixed(3),
    }).toMatchInlineSnapshot(`
      {
        "congestion": 8625,
        "flowCost": 2335.5,
        "travel": 47225,
      }
    `);
  });
});

describe("Rating (SAMPLE)", () => {
  const r = buildRating(SAMPLE);
  it("produces stable scores, composite and letter", () => {
    expect({
      scores: Object.fromEntries(Object.entries(r.scores).map(([k, v]) => [k, +v.toFixed(2)])),
      composite: +r.composite.toFixed(2),
      letter: r.letter,
      flowReductionPct: +r.flowReductionPct.toFixed(2),
      moveCount: r.moves.length,
    }).toMatchInlineSnapshot(`
      {
        "composite": 92.61,
        "flowReductionPct": 1.39,
        "letter": "A",
        "moveCount": 2,
        "scores": {
          "auto": 100,
          "balance": 83,
          "congestion": 100,
          "ergo": 65,
          "flowCost": 98.61,
          "placement": 98.61,
          "travel": 100,
        },
      }
    `);
  });
});

describe("Balance (SAMPLE)", () => {
  it("identifies CNC as the bottleneck, not the longest-cycle Assembly", () => {
    const b = balanceAnalysis(SAMPLE.stations, SAMPLE.shiftHours);
    expect(b.bottleneck?.id).toBe("cnc");
    expect({ lineOut: b.lineOut, takt: b.takt, score: b.score }).toMatchInlineSnapshot(`
      {
        "lineOut": 685,
        "score": 83,
        "takt": 42,
      }
    `);
  });

  it("scales station rate with shift hours", () => {
    const cnc = SAMPLE.stations.find((s) => s.id === "cnc")!;
    expect(stationRate(cnc, 8)).toBe(stationRate({ ...cnc, shiftHours: 8 }, 16));
    expect(stationRate(cnc, 16)).toBeGreaterThan(stationRate(cnc, 8));
  });
});

describe("Validation (SAMPLE)", () => {
  it("is valid with no blocking issues", () => {
    const v = validateFlow(SAMPLE.stations, SAMPLE.flows);
    expect(v.valid).toBe(true);
    expect(v.issues.filter((i) => i.sev === "err")).toHaveLength(0);
  });

  it("flags a dead end when a process step has no outgoing flow", () => {
    const flows = SAMPLE.flows.filter((f) => f.from !== "qa");
    const v = validateFlow(SAMPLE.stations, flows);
    expect(v.valid).toBe(false);
  });
});

describe("Automation (SAMPLE)", () => {
  it("rates chain links and coherence", () => {
    const c = chainRating(SAMPLE.stations, SAMPLE.flows);
    expect(c.links.map((l) => l.kind)).toMatchInlineSnapshot(`
      [
        "mixed",
        "mixed",
        "manual",
        "manual",
        "manual",
      ]
    `);
    expect(autoCoherenceScore(c)).toMatchInlineSnapshot(`100`);
  });

  it("scores ergonomics", () => {
    expect(ergoScore(SAMPLE.stations, SAMPLE.flows)).toMatchInlineSnapshot(`65`);
  });

  it("respects the automation override", () => {
    const cnc = SAMPLE.stations.find((s) => s.id === "cnc")!;
    expect(autoPotential({ ...cnc, autoOverride: "no" }).verdict).toBe("Keep manual");
    expect(autoPotential({ ...cnc, autoOverride: "yes" }).verdict).toBe("Automate");
  });
});

describe("Optimizer", () => {
  it("never produces overlapping stations or no-go violations by default", () => {
    const zones = [{ x: 8, y: 6, w: 2, h: 2 }];
    const out = optimize(SAMPLE.stations, SAMPLE.flows, { ...grid, noGoZones: zones });
    for (const s of out) {
      expect(hasCollision(s, s.x, s.y, out, zones)).toBe(false);
    }
  });

  it("never worsens flow cost vs the input layout", () => {
    const before = computeKPIs(SAMPLE.stations, SAMPLE.flows, grid).flowCost;
    const out = optimize(SAMPLE.stations, SAMPLE.flows, grid);
    const after = computeKPIs(out, SAMPLE.flows, grid).flowCost;
    expect(after).toBeLessThanOrEqual(before + 1e-9);
  });

  it("keeps fixed stations in place", () => {
    const out = optimize(SAMPLE.stations, SAMPLE.flows, grid);
    for (const s of SAMPLE.stations.filter((x) => x.fixed)) {
      const o = out.find((x) => x.id === s.id)!;
      expect({ x: o.x, y: o.y }).toEqual({ x: s.x, y: s.y });
    }
  });
});
