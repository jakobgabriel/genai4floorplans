import { describe, it, expect } from "vitest";
import type { CycleBreakdown, Station } from "../model/types";
import { EMPTY_CYCLE, SCHEMA_VERSION, sumCycle } from "../model/types";
import { normalizeStation, syncCycleTime } from "../model/defaults";
import { migrate } from "../model/migrate";
import { modelReducer } from "../store/reducer";
import { SAMPLE } from "../model/sample";
import { balanceAnalysis, bottleneckAdvice, stationRate } from "./balance";
import { autoHeuristic } from "./automation";
import { cycleAnalysis, cycleAdvice, effectiveCycleSec, seedBreakdown } from "./cycle";

const st = (p: Partial<Station> & { id: string }): Station => normalizeStation(p);

const bd = (p: Partial<CycleBreakdown>): CycleBreakdown => ({ ...EMPTY_CYCLE, ...p });

describe("effectiveCycleSec", () => {
  it("falls back to cycleTimeSec when not decomposed", () => {
    expect(effectiveCycleSec(st({ id: "a", cycleTimeSec: 42 }))).toBe(42);
  });

  it("sums the breakdown when decomposed", () => {
    const s = st({ id: "a", cycleTimeSec: 999, cycle: bd({ valueAddSec: 10, handlingSec: 5, walkSec: 3 }) });
    // normalizeStation syncs cycleTimeSec to the sum, so 999 is overwritten.
    expect(effectiveCycleSec(s)).toBe(18);
    expect(s.cycleTimeSec).toBe(18);
  });

  it("treats an all-zero breakdown as not cycle-bound, like cycleTimeSec 0", () => {
    const s = st({ id: "a", cycle: EMPTY_CYCLE, capacityPerShift: 500 });
    expect(effectiveCycleSec(s)).toBe(0);
    expect(stationRate(s, 8)).toBe(500); // capacity-bound, not Infinity
  });
});

describe("cycleTimeSec stays in sync with the breakdown", () => {
  it("syncCycleTime is a no-op without a breakdown", () => {
    const s = st({ id: "a", cycleTimeSec: 30 });
    expect(syncCycleTime(s)).toBe(s); // identity — no needless re-render
  });

  it("UPDATE_STATION re-syncs when the breakdown changes", () => {
    const m = { ...SAMPLE, stations: SAMPLE.stations.map((s) => ({ ...s })) };
    const next = modelReducer(m, {
      type: "UPDATE_STATION",
      id: "cnc",
      patch: { cycle: bd({ valueAddSec: 20, handlingSec: 7 }) },
    });
    const cnc = next.stations.find((s) => s.id === "cnc") as Station;
    expect(cnc.cycleTimeSec).toBe(27);
    expect(sumCycle(cnc.cycle as CycleBreakdown)).toBe(27);
  });

  it("PATCH_CYCLE_BREAKDOWN seeds from cycleTimeSec on first edit", () => {
    const m = { ...SAMPLE, stations: SAMPLE.stations.map((s) => ({ ...s })) };
    // "cnc" starts opaque at 42s. Moving 8s into handling must preserve the total.
    const next = modelReducer(m, { type: "PATCH_CYCLE_BREAKDOWN", id: "cnc", patch: { handlingSec: 8 } });
    const cnc = next.stations.find((s) => s.id === "cnc") as Station;
    expect(cnc.cycle).toEqual({ valueAddSec: 42, handlingSec: 8, walkSec: 0, waitSec: 0, setupSec: 0 });
    expect(cnc.cycleTimeSec).toBe(50); // seed is additive — planner then moves seconds out
  });

  it("SET_CYCLE_BREAKDOWN with undefined restores the opaque scalar", () => {
    const m = { ...SAMPLE, stations: SAMPLE.stations.map((s) => ({ ...s })) };
    const dec = modelReducer(m, { type: "SET_CYCLE_BREAKDOWN", id: "cnc", cycle: bd({ valueAddSec: 30, waitSec: 5 }) });
    expect((dec.stations.find((s) => s.id === "cnc") as Station).cycleTimeSec).toBe(35);
    const back = modelReducer(dec, { type: "SET_CYCLE_BREAKDOWN", id: "cnc", cycle: undefined });
    const cnc = back.stations.find((s) => s.id === "cnc") as Station;
    expect(cnc.cycle).toBeUndefined();
    expect(cnc.cycleTimeSec).toBe(35); // keeps the last synced total
  });
});

describe("migration to v6", () => {
  it("bumps the version without adding a breakdown", () => {
    const legacy = { schemaVersion: 5, name: "L", gridW: 10, gridH: 10, stations: [{ id: "a", cycleTimeSec: 12 }], flows: [], noGoZones: [] };
    const m = migrate(legacy);
    // Assert against the constant, not a literal, so later schema bumps don't
    // break a test that is really about the breakdown staying absent.
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.stations[0].cycle).toBeUndefined();
    expect(m.stations[0].cycleTimeSec).toBe(12);
  });

  it("a v6 model with a breakdown survives a round trip", () => {
    const m = migrate({ schemaVersion: SCHEMA_VERSION, name: "R", gridW: 10, gridH: 10, noGoZones: [], flows: [], stations: [{ id: "a", cycle: { valueAddSec: 9, handlingSec: 1, walkSec: 0, waitSec: 0, setupSec: 0 } }] });
    expect(m.stations[0].cycleTimeSec).toBe(10);
  });
});

describe("cycleAnalysis", () => {
  const stations = [
    st({ id: "in", role: "input", cycleTimeSec: 0 }),
    st({ id: "a", name: "A", role: "process", cycle: bd({ valueAddSec: 30, handlingSec: 10, walkSec: 5 }) }),
    st({ id: "b", name: "B", role: "process", cycle: bd({ valueAddSec: 20, waitSec: 20 }) }),
    st({ id: "c", name: "C", role: "process", cycleTimeSec: 25 }), // not decomposed
    st({ id: "out", role: "output", cycleTimeSec: 0 }),
  ];

  it("covers only process steps", () => {
    expect(cycleAnalysis(stations).totalCount).toBe(3);
  });

  it("reports null value-add pct for undecomposed steps rather than 0", () => {
    const a = cycleAnalysis(stations);
    expect(a.stations.find((s) => s.id === "c")?.valueAddPct).toBeNull();
    expect(a.stations.find((s) => s.id === "a")?.valueAddPct).toBeCloseTo(66.7, 1);
  });

  it("aggregates the line ratio over decomposed steps only", () => {
    const a = cycleAnalysis(stations);
    expect(a.decomposedCount).toBe(2);
    expect(a.complete).toBe(false);
    expect(a.lineValueAddSec).toBe(50); // 30 + 20
    expect(a.lineNonValueAddSec).toBe(35); // 10 + 5 + 20
    expect(a.lineValueAddPct).toBeCloseTo(58.8, 1);
  });

  it("ranks the waste backlog biggest-first", () => {
    const a = cycleAnalysis(stations);
    expect(a.waste[0]).toMatchObject({ stationId: "b", key: "waitSec", sec: 20 });
    expect(a.waste.map((w) => w.sec)).toEqual([20, 10, 5]);
    expect(a.waste.reduce((t, w) => t + w.sharePct, 0)).toBeCloseTo(100, 0);
  });

  it("flags over-takt stations when takt is supplied", () => {
    const a = cycleAnalysis(stations, 40);
    expect(a.stations.find((s) => s.id === "a")?.overTakt).toBe(true); // 45s > 40s
    expect(a.stations.find((s) => s.id === "b")?.overTakt).toBe(false); // 40s == 40s
    expect(a.stations.find((s) => s.id === "a")?.taktPct).toBeCloseTo(112.5, 1);
  });

  it("returns an empty, non-null-pct analysis when nothing is decomposed", () => {
    const a = cycleAnalysis([st({ id: "x", role: "process", cycleTimeSec: 10 })]);
    expect(a.lineValueAddPct).toBeNull();
    expect(a.waste).toEqual([]);
    expect(cycleAdvice(a)).toEqual([]);
  });
});

describe("advice", () => {
  it("names the dominant waste class at the bottleneck", () => {
    const stations = [
      st({ id: "in", role: "input", cycleTimeSec: 0, capacityPerShift: 100000 }),
      st({ id: "slow", name: "Slow", role: "process", cycle: bd({ valueAddSec: 20, handlingSec: 40 }), capacityPerShift: 100000 }),
      st({ id: "out", role: "output", cycleTimeSec: 0, capacityPerShift: 100000 }),
    ];
    const flows = [
      { from: "in", to: "slow", volume: 100, unitCost: 0, transport: "manual" as const, partWeightKg: 1, notes: "" },
      { from: "slow", to: "out", volume: 100, unitCost: 0, transport: "manual" as const, partWeightKg: 1, notes: "" },
    ];
    const tips = bottleneckAdvice(balanceAnalysis(stations, flows, 8), stations);
    expect(tips.join(" ")).toContain("handling");
    expect(tips.join(" ")).toContain("67%"); // 40 of 60s
  });

  it("says so when a bottleneck is fully value-add", () => {
    const s = st({ id: "s", name: "S", role: "process", cycle: bd({ valueAddSec: 50 }) });
    const stations = [st({ id: "in", role: "input", cycleTimeSec: 0 }), s, st({ id: "out", role: "output", cycleTimeSec: 0 })];
    const flows = [
      { from: "in", to: "s", volume: 100, unitCost: 0, transport: "manual" as const, partWeightKg: 1, notes: "" },
      { from: "s", to: "out", volume: 100, unitCost: 0, transport: "manual" as const, partWeightKg: 1, notes: "" },
    ];
    expect(bottleneckAdvice(balanceAnalysis(stations, flows, 8), stations).join(" ")).toContain("fully value-add");
  });

  it("keeps the legacy wording for undecomposed bottlenecks", () => {
    const tips = bottleneckAdvice(balanceAnalysis(SAMPLE.stations, SAMPLE.flows, 8), SAMPLE.stations);
    expect(tips.join(" ")).toContain("Shorten cycle time");
  });
});

describe("seedBreakdown", () => {
  it("puts the whole opaque cycle in value-add", () => {
    expect(seedBreakdown(st({ id: "a", cycleTimeSec: 42 }))).toEqual({ valueAddSec: 42, handlingSec: 0, walkSec: 0, waitSec: 0, setupSec: 0 });
  });
});

describe("inertness — decomposition must not change engine results", () => {
  it("a decomposed station scores exactly like its opaque twin", () => {
    const opaque = SAMPLE.stations;
    // Split every process station's cycle into the same total, spread across classes.
    const decomposed = SAMPLE.stations.map((s) => {
      if (s.role !== "process" || s.cycleTimeSec <= 0) return s;
      const va = s.cycleTimeSec - 6;
      return { ...s, cycle: bd({ valueAddSec: va, handlingSec: 4, walkSec: 1, waitSec: 1 }) };
    });

    const a = balanceAnalysis(opaque, SAMPLE.flows, 8);
    const b = balanceAnalysis(decomposed, SAMPLE.flows, 8);
    expect(b.lineOut).toBe(a.lineOut);
    expect(b.takt).toBe(a.takt);
    expect(b.score).toBe(a.score);
    expect(b.bottleneck?.id).toBe(a.bottleneck?.id);
    expect(b.criticalPath).toEqual(a.criticalPath);
    expect(b.steps.map((s) => s.rate)).toEqual(a.steps.map((s) => s.rate));

    opaque.forEach((s, i) => expect(autoHeuristic(decomposed[i])).toBe(autoHeuristic(s)));
  });
});

describe("cycle-bucket → VA/NNVA/NVA reconciliation (audit A-06)", () => {
  it("maps handling/setup to NNVA and walk/wait to NVA, value-add to VA", async () => {
    const { cycleKeyClass } = await import("./cycle");
    expect(cycleKeyClass("valueAddSec")).toBe("VA");
    expect(cycleKeyClass("handlingSec")).toBe("NNVA");
    expect(cycleKeyClass("setupSec")).toBe("NNVA");
    expect(cycleKeyClass("walkSec")).toBe("NVA");
    expect(cycleKeyClass("waitSec")).toBe("NVA");
  });
});
