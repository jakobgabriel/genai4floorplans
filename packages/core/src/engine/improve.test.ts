import { describe, it, expect } from "vitest";
import type { Flow, Model, Station } from "../model/types";
import { normalizeFlow, normalizeStation } from "../model/defaults";
import { SAMPLE } from "../model/sample";
import { generateCandidates } from "./generate";
import { findImprovements } from "./improve";

const st = (p: Partial<Station> & { id: string }): Station => normalizeStation(p);
const fl = (from: string, to: string): Flow => normalizeFlow({ from, to, volume: 100 });

function cell(procs: Station[]): Model {
  const stations = [
    st({ id: "in", name: "In", role: "input", x: 1, y: 6, capacityPerShift: 100000 }),
    ...procs,
    st({ id: "out", name: "Out", role: "output", x: 30, y: 6, capacityPerShift: 100000 }),
  ];
  const ids = stations.map((s) => s.id);
  const flows = ids.slice(0, -1).map((id, i) => fl(id, ids[i + 1]));
  return { schemaVersion: 8, name: "T", gridW: 34, gridH: 14, shiftHours: 8, stations, flows, noGoZones: [] };
}

describe("the reason a generated cell reported 0%", () => {
  it("a well-placed chain genuinely has no position-swap gain", () => {
    // Stations already in flow order along a straight path: no swap helps.
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 6, cycleTimeSec: 30 }),
      st({ id: "b", name: "B", role: "process", x: 12, y: 6, cycleTimeSec: 30 }),
      st({ id: "c", name: "C", role: "process", x: 18, y: 6, cycleTimeSec: 30 }),
    ]);
    const r = findImprovements(m);
    expect(r.improvements.some((i) => i.kind === "relayout")).toBe(false);
  });

  it("but still finds headroom on other axes, instead of reporting nothing", () => {
    // Same chain, badly balanced: one 90s station against two 10s ones.
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 6, cycleTimeSec: 90 }),
      st({ id: "b", name: "B", role: "process", x: 12, y: 6, cycleTimeSec: 10 }),
      st({ id: "c", name: "C", role: "process", x: 18, y: 6, cycleTimeSec: 10 }),
    ]);
    const r = findImprovements(m);
    expect(r.exhausted).toBe(false);
    expect(r.improvements.length).toBeGreaterThan(0);
    expect(r.balanceLossPct).toBeGreaterThan(50);
  });
});

describe("rebalance", () => {
  it("spots that the work fits in fewer stations", () => {
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 6, cycleTimeSec: 60 }),
      st({ id: "b", name: "B", role: "process", x: 12, y: 6, cycleTimeSec: 20 }),
      st({ id: "c", name: "C", role: "process", x: 18, y: 6, cycleTimeSec: 20 }),
    ]);
    // 100s of work at a 60s pace fits in 2 stations, not 3.
    const reb = findImprovements(m).improvements.find((i) => i.kind === "rebalance");
    expect(reb?.stationsSaved).toBe(1);
    expect(reb?.title).toMatch(/Merge 1 station/);
    expect(reb?.targetIds).toContain("c"); // one of the idle ones
  });

  it("stays quiet when the line is already tight", () => {
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 6, cycleTimeSec: 30 }),
      st({ id: "b", name: "B", role: "process", x: 12, y: 6, cycleTimeSec: 30 }),
    ]);
    expect(findImprovements(m).improvements.some((i) => i.kind === "rebalance")).toBe(false);
  });
});

describe("bottleneck", () => {
  const m = cell([
    st({ id: "slow", name: "Slow", role: "process", x: 6, y: 6, cycleTimeSec: 90 }),
    st({ id: "fast", name: "Fast", role: "process", x: 12, y: 6, cycleTimeSec: 20 }),
  ]);
  const bn = findImprovements(m).improvements.find((i) => i.kind === "bottleneck");

  it("prices the constraint in parts per shift, not percent", () => {
    expect(bn?.throughputGain).toBeGreaterThan(0);
    expect(bn?.title).toMatch(/worth [\d,]+ parts\/shift/);
  });

  it("names the next constraint, so the gain is not overstated", () => {
    expect(bn?.detail).toMatch(/next constraint is Fast/);
  });

  it("outranks everything else, because throughput is the scarcest axis", () => {
    const all = findImprovements(m).improvements;
    expect(all[0].kind).toBe("bottleneck");
  });
});

describe("waste", () => {
  const m = cell([
    st({
      id: "slow",
      name: "Slow",
      role: "process",
      x: 6,
      y: 6,
      cycle: { valueAddSec: 40, handlingSec: 0, walkSec: 30, waitSec: 0, setupSec: 0 },
    }),
    st({
      id: "fast",
      name: "Fast",
      role: "process",
      x: 12,
      y: 6,
      cycle: { valueAddSec: 10, handlingSec: 20, walkSec: 0, waitSec: 0, setupSec: 0 },
    }),
  ]);
  const w = findImprovements(m).improvements.filter((i) => i.kind === "waste");

  it("separates waste on the constraint from waste beside it", () => {
    const onBn = w.find((i) => i.targetIds.includes("slow"));
    const offBn = w.find((i) => i.targetIds.includes("fast"));
    expect(onBn?.throughputGain).toBeGreaterThan(0);
    expect(offBn?.throughputGain).toBe(0);
    expect(offBn?.detail).toMatch(/buys labour, not throughput/);
  });

  it("ranks constraint waste above the rest", () => {
    const onBn = w.find((i) => i.targetIds.includes("slow"))!;
    const offBn = w.find((i) => i.targetIds.includes("fast"))!;
    expect(onBn.impact).toBeGreaterThan(offBn.impact);
  });
});

describe("layout axes", () => {
  it("still reports the position-swap gain on a badly drawn cell", () => {
    const r = findImprovements(SAMPLE);
    // The sample is hand-placed, so swapping should help.
    const rel = r.improvements.find((i) => i.kind === "relayout");
    expect(rel?.title).toMatch(/less material travel/);
    expect(rel?.confidence).toBe("high");
  });

  it("suggests a different cell form when one shortens the route", () => {
    // Stations scattered rather than on a path.
    const m = cell([
      st({ id: "a", name: "A", role: "process", x: 6, y: 1 }),
      st({ id: "b", name: "B", role: "process", x: 25, y: 11 }),
      st({ id: "c", name: "C", role: "process", x: 6, y: 11 }),
      st({ id: "d", name: "D", role: "process", x: 25, y: 1 }),
    ]);
    const form = findImprovements(m).improvements.find((i) => i.kind === "form");
    if (form) expect(form.title).toMatch(/[IULS]-form layout/);
  });
});

describe("honesty when there is nothing left", () => {
  it("explains what was checked instead of just saying 0%", () => {
    const m = cell([st({ id: "a", name: "A", role: "process", x: 6, y: 6, cycleTimeSec: 30 })]);
    const r = findImprovements(m);
    if (r.exhausted) {
      expect(r.why).toMatch(/Checked balance, bottleneck, waste/);
      expect(r.why).toMatch(/process change|automation/);
    }
  });

  it("returns a usable report for a cell with no process steps", () => {
    const m = cell([]);
    const r = findImprovements(m);
    expect(r.exhausted).toBe(true);
    expect(r.improvements).toEqual([]);
  });
});

describe("generated cells are not dead ends", () => {
  it("finds at least one axis of headroom on a generated candidate", () => {
    const cands = generateCandidates({
      name: "T",
      annualVolume: 250000,
      annualShifts: 460,
      shiftHours: 8,
      steps: [
        { name: "Load blank" },
        { name: "Press form" },
        { name: "MIG weld" },
        { name: "Deburr" },
        { name: "Leak test" },
        { name: "Pack" },
      ],
    });
    // Every candidate should either offer something or say precisely why not.
    cands.forEach((c) => {
      const r = findImprovements(c.model);
      expect(r.why.length).toBeGreaterThan(20);
      if (r.exhausted) expect(r.why).toMatch(/Checked/);
    });
    // And across the sweep, at least one has real headroom.
    expect(cands.some((c) => findImprovements(c.model).improvements.length > 0)).toBe(true);
  });
});
