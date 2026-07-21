import { describe, it, expect } from "vitest";
import type { Station, Flow } from "../model/types";
import { SAMPLE } from "../model/sample";
import { computeKPIs } from "./kpis";
import { buildRating } from "./rating";
import { balanceAnalysis, stationRate } from "./balance";
import { customerTaktSec } from "./takt";
import { placementScore } from "./kpis";
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
        "composite": 73.7,
        "flowReductionPct": 28.92,
        "letter": "C",
        "moveCount": 3,
        "scores": {
          "auto": 100,
          "balance": 83,
          "congestion": 82,
          "ergo": 65,
          "flowCost": 71.08,
          "placement": 40,
          "travel": 70.88,
        },
      }
    `);
  });

  it("scores placement as compactness, distinct from flow cost (audit A-03)", () => {
    // Placement is no longer a copy of the flow score — it measures how tightly
    // the work packs its bounding rectangle, an independent layout dimension.
    const r = buildRating(SAMPLE);
    expect(r.scores.placement).not.toBe(r.scores.flowCost);
    expect(placementScore(SAMPLE.stations)).toBe(r.scores.placement);
  });

  it("keeps congestion an active axis, not a constant 100 (audit A-04)", () => {
    const r = buildRating(SAMPLE);
    expect(r.scores.congestion).toBeGreaterThan(0);
    expect(r.scores.congestion).toBeLessThan(100);
  });
});

describe("Balance (SAMPLE)", () => {
  it("identifies CNC as the bottleneck, not the longest-cycle Assembly", () => {
    const b = balanceAnalysis(SAMPLE.stations, SAMPLE.flows, SAMPLE.shiftHours);
    expect(b.bottleneck?.id).toBe("cnc");
    // takt is 0 with no demand modelled — the honest signal (audit A-01), not a
    // fabricated value. lineCycleSec is the achieved pace (available ÷ output).
    expect({ lineOut: b.lineOut, takt: b.takt, lineCycleSec: b.lineCycleSec, score: b.score }).toMatchInlineSnapshot(`
      {
        "lineCycleSec": 42,
        "lineOut": 685,
        "score": 83,
        "takt": 0,
      }
    `);
  });

  it("derives customer takt from demand, not from output (audit A-01)", () => {
    // 150k/yr against the default shift model (220 days × 1 shift × 8 h) →
    // 6,336,000 s ÷ 150,000 = 42.24 s takt, close to the 42 s line pace.
    const withDemand = { ...SAMPLE, demand: { years: [{ year: 2026, units: 150000 }] } };
    const b = balanceAnalysis(withDemand.stations, withDemand.flows, withDemand.shiftHours, customerTaktSec(withDemand));
    expect(b.takt).toBeCloseTo(42.2, 1);
    // The takt line moves with DEMAND: double the demand halves the takt,
    // independent of what the line actually outputs.
    const b2 = balanceAnalysis(withDemand.stations, withDemand.flows, withDemand.shiftHours, customerTaktSec({ ...withDemand, demand: { years: [{ year: 2026, units: 300000 }] } }));
    expect(b2.takt).toBeCloseTo(21.1, 1);
    expect(b2.lineOut).toBe(b.lineOut); // output unchanged — only the takt line moved
  });

  it("operators multiply throughput for manual work only, never for a machine (audit A-02)", () => {
    const cnc = SAMPLE.stations.find((s) => s.id === "cnc")!; // machine
    const asm = SAMPLE.stations.find((s) => s.id === "assembly")!; // manual
    // A second operator on the CNC does NOT change its throughput.
    expect(stationRate({ ...cnc, operators: 2 })).toBe(stationRate({ ...cnc, operators: 1 }));
    // A second worker at the manual bench does.
    expect(stationRate({ ...asm, operators: 2 })).toBeGreaterThan(stationRate({ ...asm, operators: 1 }));
    expect(stationRate({ ...asm, operators: 2 })).toBeCloseTo(2 * stationRate({ ...asm, operators: 1 }), -1);
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

  it("never places a station off the grid when swapping unequal footprints (audit C-05)", () => {
    // A wide station at the left edge and a 1-wide station at the right edge:
    // swapping their corners would push the wide one off a 10-wide grid.
    const g = { gridW: 10, gridH: 4, noGoZones: [] };
    const base = SAMPLE.stations[1];
    const wide: Station = { ...base, id: "wide", w: 5, h: 2, x: 0, y: 1, fixed: false };
    const narrow: Station = { ...base, id: "narrow", w: 1, h: 2, x: 9, y: 1, fixed: false };
    const flows: Flow[] = [{ from: "narrow", to: "wide", volume: 1000, unitCost: 1, transport: "manual", partWeightKg: 1, notes: "" }];
    const out = optimize([wide, narrow], flows, g);
    for (const s of out) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w).toBeLessThanOrEqual(g.gridW);
      expect(s.y + s.h).toBeLessThanOrEqual(g.gridH);
    }
  });
});
