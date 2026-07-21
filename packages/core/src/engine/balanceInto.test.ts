import { describe, it, expect } from "vitest";
import type { Model } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { makeWorkElement } from "./workload";
import { balanceWorkloadIntoCell } from "./generateCell";
import { balanceAnalysis } from "./balance";

function modelWith(overrides: Partial<Model> = {}): Model {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: "wl",
    gridW: 22,
    gridH: 14,
    shiftHours: 8,
    stations: [],
    flows: [],
    noGoZones: [],
    workElements: [
      { ...makeWorkElement("e1", "Load", 20) },
      { ...makeWorkElement("e2", "Weld", 30), predecessors: ["e1"] },
      { ...makeWorkElement("e3", "Inspect", 15), predecessors: ["e2"], classification: "NNVA" },
    ],
    ...overrides,
  };
}

describe("balanceWorkloadIntoCell — the workload→balancer→stations loop (audit B-02)", () => {
  it("turns work elements into placed process stations with a sequential flow", () => {
    const r = balanceWorkloadIntoCell(modelWith({ demand: { years: [{ year: 2026, units: 100000 }] } }));
    const procs = r.model.stations.filter((s) => s.role === "process");
    expect(procs.length).toBeGreaterThan(0);
    // input → …procs… → output, all wired in one chain.
    expect(r.model.stations.some((s) => s.role === "input")).toBe(true);
    expect(r.model.stations.some((s) => s.role === "output")).toBe(true);
    expect(r.model.flows.length).toBe(r.model.stations.length - 1);
    // every station sits inside the grid
    for (const s of r.model.stations) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w).toBeLessThanOrEqual(r.model.gridW);
    }
    // the result balances into a real line
    expect(balanceAnalysis(r.model.stations, r.model.flows, 8).lineOut).toBeGreaterThan(0);
  });

  it("uses the demand takt when demand is set, and says so", () => {
    const r = balanceWorkloadIntoCell(modelWith({ demand: { years: [{ year: 2026, units: 100000 }] } }));
    expect(r.taktSource).toBe("demand");
    expect(r.taktSec).toBeGreaterThan(0);
  });

  it("preserves demand, workload and grid on the new model", () => {
    const base = modelWith({ demand: { years: [{ year: 2026, units: 50000 }] }, costConfig: { laborCostPerHour: 60 } });
    const r = balanceWorkloadIntoCell(base);
    expect(r.model.demand).toEqual(base.demand);
    expect(r.model.workElements).toEqual(base.workElements);
    expect(r.model.costConfig).toEqual(base.costConfig);
  });

  it("falls back to the largest element when there is no demand or station", () => {
    const r = balanceWorkloadIntoCell(modelWith());
    expect(r.taktSource).toBe("largest-element");
    expect(r.model.stations.filter((s) => s.role === "process").length).toBeGreaterThan(0);
  });
});
